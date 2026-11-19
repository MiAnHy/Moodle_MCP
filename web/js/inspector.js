/**
 * Moodle AI Platform - Interactive Protocol & Latch Simulator
 * Powers the Two-Phase Mutation Simulator (Act 4) and Dual-Transport Inspector (Act 6).
 */

(function () {
  'use strict';

  // --- ACT 4: Two-Phase Mutation Latch Simulator ---
  const latchBtnTrigger = document.getElementById('latch-trigger');
  const latchBtnConfirm = document.getElementById('latch-confirm');
  const latchBtnReset = document.getElementById('latch-reset');
  const latchStatus = document.getElementById('latch-status');
  const payloadViewer = document.getElementById('payload-viewer');
  const mcpResponseViewer = document.getElementById('mcp-response-viewer');

  const INITIAL_PAYLOAD = {
    action: "submit-grade",
    student_id: 1042,
    assignment_id: 88,
    grade: 95.5,
    feedback: "Exceptional rigor in data structure proofs.",
    dry_run: true,
    confirm: false
  };

  const PREVIEW_RESPONSE = {
    preview: true,
    action: "submit-grade",
    student_id: 1042,
    assignment_id: 88,
    grade: 95.5,
    feedback: "Exceptional rigor in data structure proofs.",
    status: "PENDING_HUMAN_CONFIRMATION",
    message: "DRY RUN PREVIEW: Re-invoke with dry_run: false, confirm: true to commit."
  };

  const COMMITTED_RESPONSE = {
    status: "COMMITTED_TO_MOODLE_CORE",
    success: true,
    function: "mod_assign_save_grade",
    execution_time_ms: 18.4,
    audit_hash: "sha256-e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    moodle_record_id: 9942
  };

  if (latchBtnTrigger) {
    latchBtnTrigger.addEventListener('click', () => {
      latchStatus.className = 'latch-status-pill pending';
      latchStatus.textContent = 'STATUS: PENDING_HUMAN_CONFIRMATION (SAFE LATCH LOCKED)';
      
      payloadViewer.textContent = JSON.stringify(INITIAL_PAYLOAD, null, 2);
      mcpResponseViewer.textContent = JSON.stringify(PREVIEW_RESPONSE, null, 2);
      
      latchBtnTrigger.style.display = 'none';
      latchBtnConfirm.style.display = 'inline-block';
      latchBtnReset.style.display = 'inline-block';
    });
  }

  if (latchBtnConfirm) {
    latchBtnConfirm.addEventListener('click', () => {
      latchStatus.className = 'latch-status-pill committed';
      latchStatus.textContent = 'STATUS: COMMITTED_TO_MOODLE_CORE (TRANSACTION WRITTEN)';
      
      const confirmedPayload = { ...INITIAL_PAYLOAD, dry_run: false, confirm: true };
      payloadViewer.textContent = JSON.stringify(confirmedPayload, null, 2);
      mcpResponseViewer.textContent = JSON.stringify(COMMITTED_RESPONSE, null, 2);
      
      latchBtnConfirm.style.display = 'none';
    });
  }

  if (latchBtnReset) {
    latchBtnReset.addEventListener('click', () => {
      latchStatus.className = 'latch-status-pill';
      latchStatus.textContent = 'STATUS: READY (AWAITING AGENT INTENT)';
      
      payloadViewer.textContent = '// Ready to receive agent grade submission request...\n// Click "Trigger Autonomous Write" to simulate.';
      mcpResponseViewer.textContent = '// Latch output and preview diff will render here.';
      
      latchBtnTrigger.style.display = 'inline-block';
      latchBtnConfirm.style.display = 'none';
      latchBtnReset.style.display = 'none';
    });
  }

  // --- ACT 6: Dual-Transport Inspector (Signature Move) ---
  const btnStdio = document.getElementById('btn-stdio');
  const btnSse = document.getElementById('btn-sse');
  const transportMeta = document.getElementById('transport-meta');
  const packetViewer = document.getElementById('packet-viewer');
  const copyCmdText = document.getElementById('copy-cmd-text');
  const btnCopyCmd = document.getElementById('btn-copy-cmd');

  const STDIO_PACKET = {
    jsonrpc: "2.0",
    id: "mcp-req-001",
    method: "tools/call",
    params: {
      name: "moodle_describe_function",
      arguments: {
        function_name: "core_course_get_contents"
      }
    },
    transport: {
      type: "stdio",
      channel: "process.stdin / process.stdout",
      latency: "0.4ms",
      auth: "ENVIRONMENT_TOKEN_DELEGATION",
      ssrf_protection: "ENGAGED (createSecureLookup Hook)"
    }
  };

  const SSE_PACKET = {
    jsonrpc: "2.0",
    id: "mcp-req-002",
    method: "tools/call",
    params: {
      name: "moodle_get_my_grades",
      arguments: {
        course_id: 12
      }
    },
    transport: {
      type: "sse",
      endpoint: "http://localhost:3000/sse",
      session_id: "sess_a89f21d07c",
      header: "Authorization: Bearer <principal_token>",
      session_isolation: "STRICT_PER_TENANT (ADR-0009)",
      idle_prune_timeout_ms: 1800000
    }
  };

  if (btnStdio && btnSse) {
    btnStdio.addEventListener('click', () => {
      btnStdio.classList.add('active');
      btnSse.classList.remove('active');
      transportMeta.textContent = 'STDIO PROTOCOL · DIRECT PROCESS PIPELINE · ZERO NETWORK EXPOSURE';
      packetViewer.textContent = JSON.stringify(STDIO_PACKET, null, 2);
      if (copyCmdText) {
        copyCmdText.textContent = 'npx -y @moodle-ai/moodle-mcp --profile=all';
      }
    });

    btnSse.addEventListener('click', () => {
      btnSse.classList.add('active');
      btnStdio.classList.remove('active');
      transportMeta.textContent = 'SSE HTTP ENGINE · MULTI-TENANT STREAMING · SESSION-SCOPED ISOLATION';
      packetViewer.textContent = JSON.stringify(SSE_PACKET, null, 2);
      if (copyCmdText) {
        copyCmdText.textContent = 'npx -y @moodle-ai/moodle-mcp --transport=sse --port=3000';
      }
    });
  }

  if (btnCopyCmd && copyCmdText) {
    btnCopyCmd.addEventListener('click', () => {
      navigator.clipboard.writeText(copyCmdText.textContent).then(() => {
        const originalText = btnCopyCmd.textContent;
        btnCopyCmd.textContent = 'COPIED!';
        setTimeout(() => {
          btnCopyCmd.textContent = originalText;
        }, 1500);
      });
    });
  }
})();
