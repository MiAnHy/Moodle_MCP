#!/usr/bin/env node
/**
 * MCP Stdio to HTTP JSON-RPC Bridge
 * Architecture: Stateless Proxy Wrapper
 * Security Profile: Hardened against OOM, Header Injection, SSRF, and Socket Hanging.
 */

const https = require('https');
const http = require('http');
const readline = require('readline');
const { URL } = require('url');

// --- 1. CONFIGURATION & STRICT VALIDATION ---
const MOODLE_URL_RAW = process.env.MOODLE_URL;
const MOODLE_TOKEN = process.env.MOODLE_TOKEN;

// SECURITY: Prevent startup if secrets are missing
if (!MOODLE_URL_RAW || !MOODLE_TOKEN) {
    process.stderr.write("[FATAL] Missing required environment variables: MOODLE_URL or MOODLE_TOKEN.\n");
    process.exit(1);
}

// SECURITY: Prevent HTTP Header Injection (CRLF) in tokens
if (/[\r\n]/.test(MOODLE_TOKEN)) {
    process.stderr.write("[FATAL] MOODLE_TOKEN contains invalid characters (CRLF).\n");
    process.exit(1);
}

// SECURITY: Strict URL Parsing to prevent SSRF or malformed routing
let parsedUrl;
try {
    parsedUrl = new URL(MOODLE_URL_RAW);
    if (parsedUrl.protocol !== 'https:' && parsedUrl.protocol !== 'http:') {
        throw new Error("Protocol must be http: or https:");
    }
} catch (err) {
    process.stderr.write(`[FATAL] Invalid MOODLE_URL: ${err.message}\n`);
    process.exit(1);
}

const transportModule = parsedUrl.protocol === 'https:' ? https : http;

// --- 2. CONSTANTS & SAFEGUARDS ---
const MAX_PAYLOAD_SIZE = 10 * 1024 * 1024; // 10 MB limit to prevent OOM
const REQUEST_TIMEOUT_MS = 30000;          // 30-second strict socket timeout

// --- 3. CORE BRIDGE ARCHITECTURE ---
class McpBridge {
    constructor() {
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            terminal: false
        });
        
        this.rl.on('line', (line) => this.handleLine(line));
        
        // SECURITY: Catch-all to prevent the proxy from crashing the parent IDE
        process.on('uncaughtException', (err) => {
            process.stderr.write(`[UNCAUGHT EXCEPTION] ${err.message}\n`);
            process.exit(1);
        });
    }

    handleLine(line) {
        const trimmed = line.trim();
        if (!trimmed) return;

        let parsedRequest;
        try {
            parsedRequest = JSON.parse(trimmed);
        } catch (e) {
            // SECURITY: Do not reflect unparseable junk back. Silently drop and log to stderr.
            process.stderr.write("[WARN] Dropped unparseable JSON from stdin.\n");
            return;
        }

        // Validate JSON-RPC structure basics
        if (parsedRequest.jsonrpc !== "2.0") {
            this.sendErrorResponse(parsedRequest.id, -32600, "Invalid Request: Missing JSON-RPC 2.0 version");
            return;
        }

        this.forwardToMoodle(parsedRequest);
    }

    forwardToMoodle(parsedRequest) {
        // Enforce UTF-8 byte length for PHP's raw input reader
        const payloadStr = JSON.stringify(parsedRequest);
        const payloadBuffer = Buffer.from(payloadStr, 'utf8');

        const options = {
            hostname: parsedUrl.hostname,
            port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
            path: parsedUrl.pathname + parsedUrl.search,
            method: 'POST',
            timeout: REQUEST_TIMEOUT_MS,
            headers: {
                'Content-Type': 'application/json; charset=utf-8',
                'Accept': 'application/json',
                'Authorization': `Bearer ${MOODLE_TOKEN}`,
                'Content-Length': payloadBuffer.length // Crucial for PHP
            }
        };

        const req = transportModule.request(options, (res) => {
            const responseChunks = [];
            let totalLength = 0;

            res.on('data', (chunk) => {
                totalLength += chunk.length;
                
                // SECURITY: Prevent Memory Exhaustion via oversized payloads
                if (totalLength > MAX_PAYLOAD_SIZE) {
                    req.destroy(new Error("Response exceeded maximum allowed 10MB size limit."));
                    return;
                }
                responseChunks.push(chunk);
            });

            res.on('end', () => {
                const body = Buffer.concat(responseChunks).toString('utf8');
                
                // Handle Moodle PHP fatal errors that output raw HTML instead of JSON
                if (res.statusCode >= 400 && !body.trim().startsWith('{')) {
                    this.sendErrorResponse(parsedRequest.id, -32603, `Moodle HTTP Error ${res.statusCode}: ${res.statusMessage}`);
                    return;
                }

                try {
                    // Strictly parse and re-stringify to guarantee one-line output for stdio
                    const jsonResp = JSON.parse(body);
                    process.stdout.write(JSON.stringify(jsonResp) + '\n');
                } catch (err) {
                    process.stderr.write(`[ERROR] Moodle returned invalid JSON (Status ${res.statusCode}): ${body.substring(0, 150)}...\n`);
                    this.sendErrorResponse(parsedRequest.id, -32603, "Invalid JSON response from Moodle endpoint");
                }
            });
        });

        // SECURITY: Enforce Socket Timeout explicitly
        req.on('timeout', () => {
            req.destroy(new Error(`Socket timed out after ${REQUEST_TIMEOUT_MS}ms.`));
        });

        req.on('error', (e) => {
            process.stderr.write(`[NETWORK ERROR] ${e.message}\n`);
            this.sendErrorResponse(parsedRequest.id, -32603, `Upstream network failure: ${e.message}`);
        });

        req.write(payloadBuffer);
        req.end();
    }

    sendErrorResponse(id, code, message) {
        const errResp = {
            jsonrpc: "2.0",
            id: id || null, // Spec requires null if id couldn't be parsed
            error: {
                code: code,
                message: message
            }
        };
        // Standard Output is strictly reserved for valid JSON-RPC payloads
        process.stdout.write(JSON.stringify(errResp) + '\n');
    }
}

// Initialize and trap lifecycle
new McpBridge();
 