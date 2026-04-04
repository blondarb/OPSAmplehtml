import { useState, useRef, useCallback, useEffect } from 'react';
import { jsxs, jsx, Fragment } from 'react/jsx-runtime';

// src/FeedbackWidget.tsx
function useVoiceRecorder() {
  const [state, setState] = useState({
    isRecording: false,
    elapsedMs: 0,
    error: null
  });
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const chunksRef = useRef([]);
  const startTimeRef = useRef(0);
  const timerRef = useRef(null);
  const startRecording = useCallback(async () => {
    try {
      chunksRef.current = [];
      setState({ isRecording: false, elapsedMs: 0, error: null });
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 48e3
        }
      });
      streamRef.current = stream;
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : MediaRecorder.isTypeSupported("audio/webm") ? "audio/webm" : "audio/mp4";
      const recorder = new MediaRecorder(stream, {
        mimeType,
        audioBitsPerSecond: 64e3
      });
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };
      recorder.onerror = () => {
        setState((prev) => ({ ...prev, error: "Recording error occurred", isRecording: false }));
        cleanup();
      };
      mediaRecorderRef.current = recorder;
      recorder.start(3e4);
      startTimeRef.current = Date.now();
      timerRef.current = setInterval(() => {
        setState((prev) => ({
          ...prev,
          elapsedMs: Date.now() - startTimeRef.current
        }));
      }, 1e3);
      setState({ isRecording: true, elapsedMs: 0, error: null });
    } catch (err) {
      const message = err instanceof DOMException && err.name === "NotAllowedError" ? "Microphone access denied. Please allow microphone access to give voice feedback." : "Could not start recording. Please check your microphone.";
      setState({ isRecording: false, elapsedMs: 0, error: message });
    }
  }, []);
  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    mediaRecorderRef.current = null;
  }, []);
  const stopRecording = useCallback(async () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === "inactive") {
      const mimeType = recorder?.mimeType || "audio/webm";
      const blob = chunksRef.current.length > 0 ? new Blob(chunksRef.current, { type: mimeType }) : null;
      cleanup();
      setState((prev) => ({ ...prev, isRecording: false }));
      return blob;
    }
    return new Promise((resolve) => {
      let settled = false;
      const finish = (blob) => {
        if (settled) return;
        settled = true;
        cleanup();
        setState((prev) => ({ ...prev, isRecording: false }));
        resolve(blob);
      };
      const timeout = setTimeout(() => {
        console.warn("MediaRecorder.onstop did not fire within 5s \u2014 resolving with available chunks");
        const mimeType = recorder.mimeType || "audio/webm";
        const blob = chunksRef.current.length > 0 ? new Blob(chunksRef.current, { type: mimeType }) : null;
        finish(blob);
      }, 5e3);
      recorder.onstop = () => {
        clearTimeout(timeout);
        const mimeType = recorder.mimeType;
        const fullBlob = new Blob(chunksRef.current, { type: mimeType });
        finish(fullBlob);
      };
      const prevOnError = recorder.onerror;
      recorder.onerror = (ev) => {
        clearTimeout(timeout);
        console.warn("MediaRecorder error during stop:", ev);
        const mimeType = recorder.mimeType || "audio/webm";
        const blob = chunksRef.current.length > 0 ? new Blob(chunksRef.current, { type: mimeType }) : null;
        finish(blob);
        if (prevOnError) prevOnError.call(recorder, ev);
      };
      recorder.stop();
    });
  }, [cleanup]);
  const getChunks = useCallback(() => {
    return [...chunksRef.current];
  }, []);
  return {
    ...state,
    startRecording,
    stopRecording,
    getChunks
  };
}
function useEventTracker() {
  const eventsRef = useRef([]);
  const startTimeRef = useRef(0);
  const isTrackingRef = useRef(false);
  const contextRef = useRef({
    route: typeof window !== "undefined" ? window.location.pathname : "/",
    scrollPercent: 0,
    lastClickedElement: null,
    lastClickedText: null,
    viewportSection: null
  });
  const cleanupRef = useRef(null);
  const getOffsetMs = useCallback(() => {
    return Date.now() - startTimeRef.current;
  }, []);
  const pushEvent = useCallback(
    (type, data) => {
      if (!isTrackingRef.current) return;
      eventsRef.current.push({
        offsetMs: getOffsetMs(),
        type,
        data
      });
    },
    [getOffsetMs]
  );
  const getElementSelector2 = useCallback((el) => {
    if (el.id) return `#${el.id}`;
    const parts = [];
    let current = el;
    let depth = 0;
    while (current && depth < 4) {
      let selector = current.tagName.toLowerCase();
      if (current.id) {
        selector = `#${current.id}`;
        parts.unshift(selector);
        break;
      }
      const meaningful = Array.from(current.classList).filter(
        (c) => !c.includes(":") && !c.match(/^(p|m|w|h|flex|grid|text|bg|border|rounded|shadow)-/)
      );
      if (meaningful.length > 0) {
        selector += `.${meaningful.slice(0, 2).join(".")}`;
      }
      const tour = current.getAttribute("data-tour");
      const testId = current.getAttribute("data-testid");
      if (tour) selector += `[data-tour="${tour}"]`;
      else if (testId) selector += `[data-testid="${testId}"]`;
      parts.unshift(selector);
      current = current.parentElement;
      depth++;
    }
    return parts.join(" > ");
  }, []);
  const startTracking = useCallback(() => {
    if (typeof window === "undefined") return;
    startTimeRef.current = Date.now();
    eventsRef.current = [];
    isTrackingRef.current = true;
    contextRef.current.route = window.location.pathname;
    pushEvent("route", { path: window.location.pathname, hash: window.location.hash });
    let lastPath = window.location.pathname;
    const routeObserver = new MutationObserver(() => {
      if (window.location.pathname !== lastPath) {
        lastPath = window.location.pathname;
        contextRef.current.route = lastPath;
        pushEvent("route", { path: lastPath, hash: window.location.hash });
      }
    });
    routeObserver.observe(document.body, { childList: true, subtree: true });
    const onPopState = () => {
      if (window.location.pathname !== lastPath) {
        lastPath = window.location.pathname;
        contextRef.current.route = lastPath;
        pushEvent("route", { path: lastPath, hash: window.location.hash });
      }
    };
    window.addEventListener("popstate", onPopState);
    const onClick = (e) => {
      const target = e.target;
      if (!target) return;
      if (target.closest("[data-feedback-widget]")) return;
      const selector = getElementSelector2(target);
      const text = (target.textContent || "").trim().slice(0, 100);
      const tag = target.tagName.toLowerCase();
      contextRef.current.lastClickedElement = selector;
      contextRef.current.lastClickedText = text || null;
      pushEvent("click", {
        selector,
        tag,
        text,
        href: target instanceof HTMLAnchorElement ? target.href : void 0
      });
    };
    document.addEventListener("click", onClick, { capture: true });
    let scrollTimeout = null;
    const onScroll = () => {
      if (scrollTimeout) return;
      scrollTimeout = setTimeout(() => {
        scrollTimeout = null;
        const scrollTop = window.scrollY || document.documentElement.scrollTop;
        const docHeight = document.documentElement.scrollHeight - window.innerHeight;
        const percent = docHeight > 0 ? Math.round(scrollTop / docHeight * 100) : 0;
        contextRef.current.scrollPercent = percent;
        const viewportMid = scrollTop + window.innerHeight / 2;
        const sections = document.querySelectorAll("[data-tour], [data-section], section, main > div");
        let closestSection = null;
        let closestDist = Infinity;
        sections.forEach((section) => {
          const rect = section.getBoundingClientRect();
          const sectionMid = scrollTop + rect.top + rect.height / 2;
          const dist = Math.abs(viewportMid - sectionMid);
          if (dist < closestDist) {
            closestDist = dist;
            closestSection = section.getAttribute("data-tour") || section.getAttribute("data-section") || section.getAttribute("id") || section.tagName.toLowerCase();
          }
        });
        contextRef.current.viewportSection = closestSection;
        pushEvent("scroll", { percent, section: closestSection });
      }, 2e3);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    cleanupRef.current = () => {
      routeObserver.disconnect();
      window.removeEventListener("popstate", onPopState);
      document.removeEventListener("click", onClick, { capture: true });
      window.removeEventListener("scroll", onScroll);
      if (scrollTimeout) clearTimeout(scrollTimeout);
    };
  }, [pushEvent, getElementSelector2]);
  const stopTracking = useCallback(() => {
    isTrackingRef.current = false;
    cleanupRef.current?.();
    cleanupRef.current = null;
  }, []);
  const getEvents = useCallback(() => {
    return [...eventsRef.current];
  }, []);
  const getCurrentContext = useCallback(() => {
    return { ...contextRef.current };
  }, []);
  const logCustomEvent = useCallback(
    (name, detail) => {
      pushEvent("custom", { name, ...detail });
    },
    [pushEvent]
  );
  useEffect(() => {
    return () => {
      cleanupRef.current?.();
    };
  }, []);
  return {
    startTracking,
    stopTracking,
    getEvents,
    getCurrentContext,
    logCustomEvent
  };
}
function useFeedbackApi(apiUrl, apiKey) {
  const sessionIdRef = useRef(null);
  const audioUploadUrlRef = useRef(null);
  const appIdRef = useRef(null);
  const headers = useCallback(() => {
    const h = { "Content-Type": "application/json" };
    if (apiKey) h["x-api-key"] = apiKey;
    return h;
  }, [apiKey]);
  const createSession = useCallback(
    async (appId, user) => {
      const res = await fetch(`${apiUrl}/sessions`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({
          appId,
          userId: user?.id,
          userLabel: user?.label,
          userAgent: navigator.userAgent,
          screenSize: `${window.innerWidth}x${window.innerHeight}`,
          startedAt: (/* @__PURE__ */ new Date()).toISOString()
        })
      });
      if (!res.ok) throw new Error(`Failed to create session: ${res.status}`);
      const data = await res.json();
      sessionIdRef.current = data.sessionId;
      audioUploadUrlRef.current = data.audioUploadUrl;
      appIdRef.current = appId;
      return data.sessionId;
    },
    [apiUrl, headers]
  );
  const uploadAudio = useCallback(async (blob) => {
    const url = audioUploadUrlRef.current;
    if (!url) throw new Error("No upload URL \u2014 create session first");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3e4);
    try {
      const res = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": blob.type },
        body: blob,
        signal: controller.signal
      });
      if (!res.ok) throw new Error(`Failed to upload audio: ${res.status}`);
    } finally {
      clearTimeout(timeout);
    }
  }, []);
  const getUploadUrl = useCallback(
    async (type, index) => {
      const sessionId = sessionIdRef.current;
      if (!sessionId) throw new Error("No session \u2014 create session first");
      const res = await fetch(`${apiUrl}/sessions/${sessionId}/upload-url`, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify({ type, index, appId: appIdRef.current })
      });
      if (!res.ok) throw new Error(`Failed to get upload URL: ${res.status}`);
      const data = await res.json();
      return { uploadUrl: data.uploadUrl, key: data.key };
    },
    [apiUrl, headers]
  );
  const submitSession = useCallback(
    async (data) => {
      const sessionId = sessionIdRef.current;
      if (!sessionId) throw new Error("No session \u2014 create session first");
      const payload = {
        appId: appIdRef.current,
        category: data.category,
        events: data.events,
        duration: data.duration,
        status: "submitted"
      };
      if (data.chatMessages && data.chatMessages.length > 0) {
        payload.chatMessages = data.chatMessages;
      }
      if (data.annotations && data.annotations.length > 0) {
        payload.annotations = data.annotations;
      }
      if (data.chatSummary) {
        payload.chatSummary = data.chatSummary;
      }
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15e3);
      try {
        const res = await fetch(`${apiUrl}/sessions/${sessionId}`, {
          method: "PUT",
          headers: headers(),
          body: JSON.stringify(payload),
          signal: controller.signal
        });
        if (!res.ok) throw new Error(`Failed to submit session: ${res.status}`);
      } finally {
        clearTimeout(timeout);
      }
    },
    [apiUrl, headers]
  );
  return {
    createSession,
    uploadAudio,
    submitSession,
    getUploadUrl
  };
}
var messageCounter = 0;
function generateMessageId() {
  messageCounter += 1;
  return `msg-${Date.now()}-${messageCounter}`;
}
function useChatApi(chatApiUrl, sessionId, appId, apiKey) {
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const messagesRef = useRef([]);
  const sessionIdRef = useRef(sessionId);
  sessionIdRef.current = sessionId;
  const sendMessage = useCallback(async (content, attachments) => {
    if (!sessionIdRef.current) {
      setError("No active session \u2014 start a feedback session first");
      return;
    }
    const userMessage = {
      id: generateMessageId(),
      role: "user",
      content,
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      attachments
    };
    const updated = [...messagesRef.current, userMessage];
    messagesRef.current = updated;
    setMessages(updated);
    setIsLoading(true);
    setError(null);
    try {
      const chatHeaders = { "Content-Type": "application/json" };
      if (apiKey) chatHeaders["x-api-key"] = apiKey;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3e4);
      let res;
      try {
        res = await fetch(`${chatApiUrl}/chat`, {
          method: "POST",
          headers: chatHeaders,
          body: JSON.stringify({
            sessionId: sessionIdRef.current,
            appId,
            message: content,
            attachments,
            history: messagesRef.current.map((m) => ({ role: m.role, content: m.content })),
            context: {
              pageUrl: window.location.href,
              pageTitle: document.title,
              viewport: { width: window.innerWidth, height: window.innerHeight }
            }
          }),
          signal: controller.signal
        });
      } finally {
        clearTimeout(timeout);
      }
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(errBody.error || `Chat request failed: ${res.status}`);
      }
      const data = await res.json();
      const assistantMessage = {
        id: generateMessageId(),
        role: "assistant",
        content: data.reply,
        timestamp: (/* @__PURE__ */ new Date()).toISOString()
      };
      const withReply = [...messagesRef.current, assistantMessage];
      messagesRef.current = withReply;
      setMessages(withReply);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send message");
    } finally {
      setIsLoading(false);
    }
  }, [chatApiUrl, appId, apiKey]);
  const summarize = useCallback(async () => {
    if (!sessionIdRef.current || messagesRef.current.length === 0) return null;
    try {
      const sumHeaders = { "Content-Type": "application/json" };
      if (apiKey) sumHeaders["x-api-key"] = apiKey;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3e4);
      let res;
      try {
        res = await fetch(`${chatApiUrl}/chat/summarize`, {
          method: "POST",
          headers: sumHeaders,
          body: JSON.stringify({
            sessionId: sessionIdRef.current,
            appId,
            messages: messagesRef.current.map((m) => ({
              role: m.role,
              content: m.content,
              attachments: m.attachments
            }))
          }),
          signal: controller.signal
        });
      } finally {
        clearTimeout(timeout);
      }
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }, [chatApiUrl, appId, apiKey]);
  const reset = useCallback(() => {
    messagesRef.current = [];
    setMessages([]);
    setIsLoading(false);
    setError(null);
  }, []);
  return { messages, isLoading, error, sendMessage, summarize, reset };
}
function getElementSelector(el) {
  if (el.id) return `#${el.id}`;
  const parts = [];
  let current = el;
  let depth = 0;
  while (current && depth < 4) {
    let selector = current.tagName.toLowerCase();
    if (current.id) {
      parts.unshift(`#${current.id}`);
      break;
    }
    const meaningful = Array.from(current.classList).filter(
      (c) => !c.includes(":") && !c.match(/^(p|m|w|h|flex|grid|text|bg|border|rounded|shadow)-/)
    );
    if (meaningful.length > 0) {
      selector += `.${meaningful.slice(0, 2).join(".")}`;
    }
    parts.unshift(selector);
    current = current.parentElement;
    depth++;
  }
  return parts.join(" > ");
}
function useScreenshotAnnotation(uploadScreenshot) {
  const [isAnnotating, setIsAnnotating] = useState(false);
  const [lastAnnotation, setLastAnnotation] = useState(null);
  const [annotations, setAnnotations] = useState([]);
  const overlayRef = useRef(null);
  const cleanupRef = useRef(null);
  const captureScreenshot = useCallback(async () => {
    if (overlayRef.current) overlayRef.current.style.display = "none";
    try {
      if ("mediaDevices" in navigator && "getDisplayMedia" in navigator.mediaDevices) {
      }
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      const svgData = `
        <svg xmlns="http://www.w3.org/2000/svg" width="${canvas.width}" height="${canvas.height}">
          <foreignObject width="100%" height="100%">
            <div xmlns="http://www.w3.org/1999/xhtml">
              ${new XMLSerializer().serializeToString(document.documentElement)}
            </div>
          </foreignObject>
        </svg>`;
      const img = new Image();
      const svgBlob = new Blob([svgData], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(svgBlob);
      return new Promise((resolve) => {
        img.onload = () => {
          ctx.drawImage(img, 0, 0);
          URL.revokeObjectURL(url);
          canvas.toBlob((blob) => resolve(blob), "image/png", 0.8);
        };
        img.onerror = () => {
          URL.revokeObjectURL(url);
          ctx.fillStyle = "#f0f0f0";
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.fillStyle = "#666";
          ctx.font = "16px system-ui";
          ctx.fillText(`Screenshot of ${window.location.pathname}`, 20, 40);
          ctx.fillText(`Viewport: ${canvas.width}x${canvas.height}`, 20, 65);
          canvas.toBlob((blob) => resolve(blob), "image/png", 0.8);
        };
        img.src = url;
      });
    } finally {
      if (overlayRef.current) overlayRef.current.style.display = "";
    }
  }, []);
  const startAnnotation = useCallback(() => {
    cleanupRef.current?.();
    setIsAnnotating(true);
    setLastAnnotation(null);
    const overlay = document.createElement("div");
    overlay.setAttribute("data-feedback-annotation-overlay", "true");
    Object.assign(overlay.style, {
      position: "fixed",
      inset: "0",
      zIndex: "100000",
      backgroundColor: "rgba(0, 0, 0, 0.15)",
      cursor: "crosshair",
      transition: "background-color 0.2s"
    });
    const tooltip = document.createElement("div");
    Object.assign(tooltip.style, {
      position: "fixed",
      padding: "6px 12px",
      borderRadius: "6px",
      backgroundColor: "rgba(13, 148, 136, 0.95)",
      color: "#fff",
      fontSize: "13px",
      fontWeight: "600",
      fontFamily: "system-ui, sans-serif",
      pointerEvents: "none",
      zIndex: "100001",
      boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
      display: "none"
    });
    tooltip.textContent = "Click to highlight what you\u2019re talking about";
    document.body.appendChild(tooltip);
    const highlight = document.createElement("div");
    Object.assign(highlight.style, {
      position: "fixed",
      border: "2px solid rgba(13, 148, 136, 0.7)",
      backgroundColor: "rgba(13, 148, 136, 0.1)",
      borderRadius: "4px",
      pointerEvents: "none",
      zIndex: "100001",
      transition: "all 0.1s",
      display: "none"
    });
    document.body.appendChild(highlight);
    overlayRef.current = overlay;
    const onMouseMove = (e) => {
      tooltip.style.display = "block";
      tooltip.style.left = `${e.clientX + 16}px`;
      tooltip.style.top = `${e.clientY + 16}px`;
      overlay.style.pointerEvents = "none";
      const elementUnder = document.elementFromPoint(e.clientX, e.clientY);
      overlay.style.pointerEvents = "";
      if (elementUnder && !elementUnder.closest("[data-feedback-widget]") && !elementUnder.closest("[data-feedback-annotation-overlay]")) {
        const rect = elementUnder.getBoundingClientRect();
        highlight.style.display = "block";
        highlight.style.left = `${rect.left}px`;
        highlight.style.top = `${rect.top}px`;
        highlight.style.width = `${rect.width}px`;
        highlight.style.height = `${rect.height}px`;
      } else {
        highlight.style.display = "none";
      }
    };
    const onClick = async (e) => {
      e.preventDefault();
      e.stopPropagation();
      overlay.style.pointerEvents = "none";
      const elementUnder = document.elementFromPoint(e.clientX, e.clientY);
      overlay.style.pointerEvents = "";
      if (!elementUnder) {
        cleanup();
        return;
      }
      try {
        const selector = getElementSelector(elementUnder);
        const text = (elementUnder.textContent || "").trim().slice(0, 200);
        const tag = elementUnder.tagName.toLowerCase();
        let screenshotBlob = null;
        try {
          screenshotBlob = await captureScreenshot();
        } catch {
        }
        let screenshotKey = "";
        if (screenshotBlob) {
          try {
            screenshotKey = await uploadScreenshot(screenshotBlob, annotations.length);
          } catch {
          }
        }
        const annotation = {
          screenshotKey,
          coordinates: { x: e.clientX, y: e.clientY },
          elementInfo: {
            selector,
            tag,
            text,
            id: elementUnder.id || void 0,
            className: elementUnder.className?.toString().slice(0, 200) || void 0
          },
          pageUrl: window.location.href,
          viewport: { width: window.innerWidth, height: window.innerHeight }
        };
        setLastAnnotation(annotation);
        setAnnotations((prev) => [...prev, annotation]);
        const flash = document.createElement("div");
        Object.assign(flash.style, {
          position: "fixed",
          bottom: "80px",
          left: "50%",
          transform: "translateX(-50%)",
          padding: "8px 16px",
          borderRadius: "8px",
          backgroundColor: "rgba(13, 148, 136, 0.95)",
          color: "#fff",
          fontSize: "13px",
          fontWeight: "600",
          fontFamily: "system-ui, sans-serif",
          zIndex: "100002",
          boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
          transition: "opacity 0.3s"
        });
        flash.textContent = `\u2713 Captured \u2014 ${tag}${text ? ': "' + text.slice(0, 40) + '"' : ""}`;
        document.body.appendChild(flash);
        setTimeout(() => {
          flash.style.opacity = "0";
        }, 1500);
        setTimeout(() => {
          flash.remove();
        }, 1800);
      } finally {
        cleanup();
      }
    };
    const onKeyDown = (e) => {
      if (e.key === "Escape") {
        cleanup();
      }
    };
    const cleanup = () => {
      overlay.removeEventListener("mousemove", onMouseMove);
      overlay.removeEventListener("click", onClick);
      window.removeEventListener("keydown", onKeyDown);
      overlay.remove();
      tooltip.remove();
      highlight.remove();
      overlayRef.current = null;
      setIsAnnotating(false);
    };
    cleanupRef.current = cleanup;
    overlay.addEventListener("mousemove", onMouseMove);
    overlay.addEventListener("click", onClick);
    window.addEventListener("keydown", onKeyDown);
    document.body.appendChild(overlay);
  }, [captureScreenshot, uploadScreenshot, annotations.length]);
  const cancelAnnotation = useCallback(() => {
    cleanupRef.current?.();
  }, []);
  return { isAnnotating, startAnnotation, cancelAnnotation, lastAnnotation, annotations };
}
var CATEGORIES = [
  { value: "bug", label: "Bug", icon: "\u{1F41B}" },
  { value: "suggestion", label: "Suggestion", icon: "\u{1F4A1}" },
  { value: "confusion", label: "Confused", icon: "\u2753" },
  { value: "praise", label: "Praise", icon: "\u{1F44D}" }
];
var POSITION_CLASSES = {
  "bottom-right": { bottom: 24, right: 24 },
  "bottom-left": { bottom: 24, left: 24 },
  "top-right": { top: 24, right: 24 },
  "top-left": { top: 24, left: 24 }
};
var INACTIVITY_TIMEOUT_MS = 5 * 60 * 1e3;
function formatTime(ms) {
  const secs = Math.floor(ms / 1e3);
  const mins = Math.floor(secs / 60);
  const remainingSecs = secs % 60;
  return `${mins}:${remainingSecs.toString().padStart(2, "0")}`;
}
function MicIcon({ size = 16 }) {
  return /* @__PURE__ */ jsxs("svg", { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [
    /* @__PURE__ */ jsx("path", { d: "M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" }),
    /* @__PURE__ */ jsx("path", { d: "M19 10v2a7 7 0 0 1-14 0v-2" }),
    /* @__PURE__ */ jsx("line", { x1: "12", y1: "19", x2: "12", y2: "22" })
  ] });
}
function ChatIcon({ size = 16 }) {
  return /* @__PURE__ */ jsx("svg", { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: /* @__PURE__ */ jsx("path", { d: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" }) });
}
function CameraIcon({ size = 16 }) {
  return /* @__PURE__ */ jsxs("svg", { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: "2", strokeLinecap: "round", strokeLinejoin: "round", children: [
    /* @__PURE__ */ jsx("path", { d: "M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" }),
    /* @__PURE__ */ jsx("circle", { cx: "12", cy: "13", r: "3" })
  ] });
}
function SendIcon({ size = 16 }) {
  return /* @__PURE__ */ jsx("svg", { width: size, height: size, viewBox: "0 0 24 24", fill: "currentColor", children: /* @__PURE__ */ jsx("path", { d: "M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" }) });
}
function FeedbackWidget({ appId, apiUrl, user, position = "bottom-right", apiKey, chatApiUrl }) {
  const [widgetState, setWidgetState] = useState("idle");
  const [isExpanded, setIsExpanded] = useState(false);
  const [category, setCategory] = useState("suggestion");
  const [errorMessage, setErrorMessage] = useState(null);
  const [chatInput, setChatInput] = useState("");
  const [isVoiceRecordingInChat, setIsVoiceRecordingInChat] = useState(false);
  const [submittingTooLong, setSubmittingTooLong] = useState(false);
  const submittingTimerRef = useRef(null);
  const sessionStartRef = useRef(0);
  const sessionIdRef = useRef(null);
  const inactivityTimerRef = useRef(null);
  const chatMessagesEndRef = useRef(null);
  const recorder = useVoiceRecorder();
  const chatVoiceRecorder = useVoiceRecorder();
  const tracker = useEventTracker();
  const api = useFeedbackApi(apiUrl, apiKey);
  const chat = useChatApi(chatApiUrl || "", sessionIdRef.current, appId, apiKey);
  const chatEnabled = Boolean(chatApiUrl);
  const uploadScreenshotForAnnotation = useCallback(async (blob, index) => {
    const { uploadUrl, key } = await api.getUploadUrl("screenshot", index);
    await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": "image/png" }, body: blob });
    return key;
  }, [api]);
  const annotation = useScreenshotAnnotation(uploadScreenshotForAnnotation);
  useEffect(() => {
    if (widgetState === "submitting") {
      setSubmittingTooLong(false);
      submittingTimerRef.current = setTimeout(() => setSubmittingTooLong(true), 1e4);
    } else {
      setSubmittingTooLong(false);
      if (submittingTimerRef.current) {
        clearTimeout(submittingTimerRef.current);
        submittingTimerRef.current = null;
      }
    }
    return () => {
      if (submittingTimerRef.current) clearTimeout(submittingTimerRef.current);
    };
  }, [widgetState]);
  useEffect(() => {
    chatMessagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chat.messages]);
  useEffect(() => {
    if (annotation.lastAnnotation && widgetState === "chatting") {
      const ann = annotation.lastAnnotation;
      const description = `[Pointed at ${ann.elementInfo.tag}${ann.elementInfo.text ? `: "${ann.elementInfo.text.slice(0, 80)}"` : ""} at (${ann.coordinates.x}, ${ann.coordinates.y}) on ${ann.pageUrl}]`;
      chat.sendMessage(description, [{
        type: "annotation",
        annotation: ann
      }]);
    }
  }, [annotation.lastAnnotation]);
  const resetInactivityTimer = useCallback(() => {
    if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    inactivityTimerRef.current = setTimeout(() => {
      if (widgetState === "recording") {
        handleStopRef.current();
      }
    }, INACTIVITY_TIMEOUT_MS);
  }, [widgetState]);
  const handleStopRef = useRef(() => {
  });
  useEffect(() => {
    if (widgetState !== "recording") return;
    const onActivity = () => resetInactivityTimer();
    window.addEventListener("click", onActivity, true);
    window.addEventListener("scroll", onActivity, true);
    window.addEventListener("keydown", onActivity, true);
    window.addEventListener("mousemove", onActivity, true);
    resetInactivityTimer();
    return () => {
      window.removeEventListener("click", onActivity, true);
      window.removeEventListener("scroll", onActivity, true);
      window.removeEventListener("keydown", onActivity, true);
      window.removeEventListener("mousemove", onActivity, true);
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current);
    };
  }, [widgetState, resetInactivityTimer]);
  const handleStartRecording = useCallback(async () => {
    try {
      setErrorMessage(null);
      const sid = await api.createSession(appId, user);
      sessionIdRef.current = sid;
      await recorder.startRecording();
      tracker.startTracking();
      sessionStartRef.current = Date.now();
      setWidgetState("recording");
      setIsExpanded(false);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to start recording");
      setWidgetState("error");
    }
  }, [api, appId, user, recorder, tracker]);
  const handleStartChat = useCallback(async () => {
    try {
      setErrorMessage(null);
      const sid = await api.createSession(appId, user);
      sessionIdRef.current = sid;
      tracker.startTracking();
      sessionStartRef.current = Date.now();
      chat.reset();
      setWidgetState("chatting");
      setTimeout(() => {
        chat.sendMessage("__init__");
      }, 300);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to start chat session");
      setWidgetState("error");
    }
  }, [api, appId, user, tracker, chat]);
  const handleStopRecording = useCallback(async () => {
    try {
      setWidgetState("submitting");
      setIsExpanded(true);
      const audioBlob = await recorder.stopRecording();
      tracker.stopTracking();
      const duration = Math.round((Date.now() - sessionStartRef.current) / 1e3);
      if (audioBlob && audioBlob.size > 0) {
        await api.uploadAudio(audioBlob);
      }
      await api.submitSession({ category, events: tracker.getEvents(), duration });
      setWidgetState("submitted");
      setTimeout(() => {
        setWidgetState("idle");
        setIsExpanded(false);
      }, 3e3);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to submit feedback");
      setWidgetState("error");
    }
  }, [recorder, tracker, api, category]);
  const handleEndChat = useCallback(async () => {
    try {
      setWidgetState("submitting");
      tracker.stopTracking();
      const duration = Math.round((Date.now() - sessionStartRef.current) / 1e3);
      const summary = await chat.summarize();
      await api.submitSession({
        category: summary?.category || category,
        events: tracker.getEvents(),
        duration,
        chatMessages: chat.messages,
        annotations: annotation.annotations,
        chatSummary: summary || void 0
      });
      setWidgetState("submitted");
      setTimeout(() => {
        setWidgetState("idle");
        setIsExpanded(false);
        chat.reset();
      }, 3e3);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Failed to submit feedback");
      setWidgetState("error");
    }
  }, [tracker, api, category, chat, annotation.annotations]);
  handleStopRef.current = handleStopRecording;
  const handleSendChatMessage = useCallback(async () => {
    const text = chatInput.trim();
    if (!text) return;
    setChatInput("");
    await chat.sendMessage(text);
  }, [chatInput, chat]);
  const handleVoiceInChat = useCallback(async () => {
    if (isVoiceRecordingInChat) {
      setIsVoiceRecordingInChat(false);
      const blob = await chatVoiceRecorder.stopRecording();
      if (blob && blob.size > 0) {
        try {
          const { uploadUrl, key } = await api.getUploadUrl("audio-chunk", Date.now());
          await fetch(uploadUrl, { method: "PUT", headers: { "Content-Type": blob.type }, body: blob });
          chat.sendMessage("[Voice message - transcribing...]", [{
            type: "voice-transcript",
            key
          }]);
        } catch {
          setErrorMessage("Failed to upload voice message");
        }
      }
    } else {
      setIsVoiceRecordingInChat(true);
      await chatVoiceRecorder.startRecording();
    }
  }, [isVoiceRecordingInChat, chatVoiceRecorder, api, chat]);
  const handleAnnotate = useCallback(() => {
    annotation.startAnnotation();
  }, [annotation]);
  const handleReset = useCallback(() => {
    setWidgetState("idle");
    setErrorMessage(null);
    setIsExpanded(false);
    setChatInput("");
    chat.reset();
  }, [chat]);
  const positionStyle = POSITION_CLASSES[position] || POSITION_CLASSES["bottom-right"];
  const renderChatMessages = () => /* @__PURE__ */ jsxs("div", { style: {
    flex: 1,
    overflowY: "auto",
    padding: "8px 12px",
    display: "flex",
    flexDirection: "column",
    gap: 8,
    maxHeight: 280,
    minHeight: 120
  }, children: [
    chat.messages.filter((m) => m.content !== "__init__").map((msg) => /* @__PURE__ */ jsx("div", { style: {
      display: "flex",
      justifyContent: msg.role === "user" ? "flex-end" : "flex-start"
    }, children: /* @__PURE__ */ jsxs("div", { style: {
      maxWidth: "85%",
      padding: "8px 12px",
      borderRadius: msg.role === "user" ? "12px 12px 2px 12px" : "12px 12px 12px 2px",
      backgroundColor: msg.role === "user" ? "#0D9488" : "#F3F4F6",
      color: msg.role === "user" ? "#fff" : "#1F2937",
      fontSize: 13,
      lineHeight: 1.5,
      wordBreak: "break-word"
    }, children: [
      msg.content,
      msg.attachments?.some((a) => a.type === "annotation") && /* @__PURE__ */ jsxs("div", { style: {
        marginTop: 4,
        fontSize: 11,
        opacity: 0.8,
        display: "flex",
        alignItems: "center",
        gap: 4
      }, children: [
        /* @__PURE__ */ jsx(CameraIcon, { size: 11 }),
        " Screenshot attached"
      ] })
    ] }) }, msg.id)),
    chat.isLoading && /* @__PURE__ */ jsx("div", { style: { display: "flex", justifyContent: "flex-start" }, children: /* @__PURE__ */ jsx("div", { style: {
      padding: "8px 16px",
      borderRadius: "12px 12px 12px 2px",
      backgroundColor: "#F3F4F6",
      color: "#9CA3AF",
      fontSize: 13
    }, children: /* @__PURE__ */ jsx("span", { style: { animation: "feedback-pulse 1.2s ease-in-out infinite" }, children: "Thinking..." }) }) }),
    /* @__PURE__ */ jsx("div", { ref: chatMessagesEndRef })
  ] });
  const renderChatInput = () => /* @__PURE__ */ jsxs("div", { style: {
    padding: "8px 12px",
    borderTop: "1px solid #E5E7EB",
    display: "flex",
    gap: 6,
    alignItems: "flex-end"
  }, children: [
    /* @__PURE__ */ jsx(
      "button",
      {
        onClick: handleAnnotate,
        title: "Point to something on the page",
        style: {
          padding: 6,
          borderRadius: 6,
          border: "1px solid #E5E7EB",
          backgroundColor: "#fff",
          color: "#6B7280",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          flexShrink: 0
        },
        children: /* @__PURE__ */ jsx(CameraIcon, { size: 16 })
      }
    ),
    /* @__PURE__ */ jsx(
      "button",
      {
        onClick: handleVoiceInChat,
        title: isVoiceRecordingInChat ? "Stop recording" : "Record voice message",
        style: {
          padding: 6,
          borderRadius: 6,
          border: `1px solid ${isVoiceRecordingInChat ? "#EF4444" : "#E5E7EB"}`,
          backgroundColor: isVoiceRecordingInChat ? "#FEF2F2" : "#fff",
          color: isVoiceRecordingInChat ? "#EF4444" : "#6B7280",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          flexShrink: 0,
          animation: isVoiceRecordingInChat ? "feedback-pulse 1.5s ease-in-out infinite" : "none"
        },
        children: /* @__PURE__ */ jsx(MicIcon, { size: 16 })
      }
    ),
    /* @__PURE__ */ jsx(
      "input",
      {
        type: "text",
        value: chatInput,
        onChange: (e) => setChatInput(e.target.value),
        onKeyDown: (e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSendChatMessage();
          }
        },
        placeholder: "What's on your mind? Navigate to the page first...",
        style: {
          flex: 1,
          padding: "8px 12px",
          borderRadius: 8,
          border: "1px solid #E5E7EB",
          fontSize: 13,
          outline: "none",
          fontFamily: "inherit"
        },
        disabled: false
      }
    ),
    /* @__PURE__ */ jsx(
      "button",
      {
        onClick: handleSendChatMessage,
        disabled: !chatInput.trim() || chat.isLoading,
        style: {
          padding: 6,
          borderRadius: 6,
          border: "none",
          backgroundColor: chatInput.trim() ? "#0D9488" : "#E5E7EB",
          color: chatInput.trim() ? "#fff" : "#9CA3AF",
          cursor: chatInput.trim() ? "pointer" : "default",
          display: "flex",
          alignItems: "center",
          flexShrink: 0
        },
        children: /* @__PURE__ */ jsx(SendIcon, { size: 16 })
      }
    )
  ] });
  if (widgetState === "recording" && !isExpanded) {
    return /* @__PURE__ */ jsxs("div", { "data-feedback-widget": true, style: { ...positionStyle, position: "fixed", zIndex: 99999 }, children: [
      /* @__PURE__ */ jsxs(
        "div",
        {
          style: {
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "8px 14px",
            borderRadius: 20,
            backgroundColor: "rgba(239, 68, 68, 0.95)",
            color: "#fff",
            fontFamily: "system-ui, sans-serif",
            fontSize: 13,
            fontWeight: 600,
            boxShadow: "0 2px 8px rgba(239, 68, 68, 0.3)",
            cursor: "pointer",
            animation: "feedback-pulse 2s ease-in-out infinite"
          },
          onClick: () => setIsExpanded(true),
          children: [
            /* @__PURE__ */ jsx("span", { style: { width: 8, height: 8, borderRadius: 4, backgroundColor: "#fff" } }),
            formatTime(recorder.elapsedMs),
            /* @__PURE__ */ jsx(
              "button",
              {
                onClick: (e) => {
                  e.stopPropagation();
                  handleStopRecording();
                },
                style: {
                  marginLeft: 4,
                  padding: "2px 8px",
                  borderRadius: 10,
                  border: "1px solid rgba(255,255,255,0.5)",
                  backgroundColor: "rgba(255,255,255,0.2)",
                  color: "#fff",
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: "pointer"
                },
                children: "Stop"
              }
            )
          ]
        }
      ),
      /* @__PURE__ */ jsx("style", { children: `@keyframes feedback-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.85; } }` })
    ] });
  }
  if (widgetState === "chatting" && !isExpanded) {
    return /* @__PURE__ */ jsx("div", { "data-feedback-widget": true, style: { ...positionStyle, position: "fixed", zIndex: 99999 }, children: /* @__PURE__ */ jsxs(
      "div",
      {
        style: {
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 14px",
          borderRadius: 20,
          backgroundColor: "rgba(13, 148, 136, 0.95)",
          color: "#fff",
          fontFamily: "system-ui, sans-serif",
          fontSize: 13,
          fontWeight: 600,
          boxShadow: "0 2px 8px rgba(13, 148, 136, 0.3)",
          cursor: "pointer"
        },
        onClick: () => setIsExpanded(true),
        children: [
          /* @__PURE__ */ jsx(ChatIcon, { size: 14 }),
          "Chat (",
          chat.messages.filter((m) => m.content !== "__init__").length,
          " msgs)",
          /* @__PURE__ */ jsx(
            "button",
            {
              onClick: (e) => {
                e.stopPropagation();
                handleEndChat();
              },
              style: {
                marginLeft: 4,
                padding: "2px 8px",
                borderRadius: 10,
                border: "1px solid rgba(255,255,255,0.5)",
                backgroundColor: "rgba(255,255,255,0.2)",
                color: "#fff",
                fontSize: 11,
                fontWeight: 600,
                cursor: "pointer"
              },
              children: "End"
            }
          )
        ]
      }
    ) });
  }
  if ((widgetState === "idle" || widgetState === "annotating") && !isExpanded) {
    return /* @__PURE__ */ jsx("div", { "data-feedback-widget": true, style: { ...positionStyle, position: "fixed", zIndex: 99999 }, children: /* @__PURE__ */ jsxs(
      "button",
      {
        onClick: () => setIsExpanded(true),
        style: {
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "10px 18px",
          borderRadius: 24,
          border: "none",
          backgroundColor: "#0D9488",
          color: "#fff",
          fontSize: 14,
          fontWeight: 600,
          fontFamily: "system-ui, sans-serif",
          cursor: "pointer",
          boxShadow: "0 4px 12px rgba(13, 148, 136, 0.3)",
          transition: "transform 0.15s, box-shadow 0.15s"
        },
        onMouseEnter: (e) => {
          e.currentTarget.style.transform = "scale(1.05)";
          e.currentTarget.style.boxShadow = "0 6px 16px rgba(13, 148, 136, 0.4)";
        },
        onMouseLeave: (e) => {
          e.currentTarget.style.transform = "scale(1)";
          e.currentTarget.style.boxShadow = "0 4px 12px rgba(13, 148, 136, 0.3)";
        },
        children: [
          /* @__PURE__ */ jsx(ChatIcon, { size: 18 }),
          "Give Feedback"
        ]
      }
    ) });
  }
  const headerColor = widgetState === "recording" ? "#EF4444" : widgetState === "chatting" ? "#0D9488" : widgetState === "submitted" ? "#10B981" : "#0D9488";
  const headerTitle = widgetState === "recording" ? `Recording ${formatTime(recorder.elapsedMs)}` : widgetState === "chatting" ? "Feedback Chat" : widgetState === "submitting" ? "Submitting..." : widgetState === "submitted" ? "Thank you!" : "Feedback";
  return /* @__PURE__ */ jsxs(
    "div",
    {
      "data-feedback-widget": true,
      style: {
        ...positionStyle,
        position: "fixed",
        zIndex: 99999,
        width: widgetState === "chatting" ? 360 : 320,
        borderRadius: 16,
        backgroundColor: "#fff",
        boxShadow: "0 8px 32px rgba(0, 0, 0, 0.15)",
        fontFamily: "system-ui, -apple-system, sans-serif",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        maxHeight: widgetState === "chatting" ? "70vh" : "auto"
      },
      children: [
        /* @__PURE__ */ jsxs("div", { style: {
          padding: "14px 16px",
          backgroundColor: headerColor,
          color: "#fff",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          flexShrink: 0
        }, children: [
          /* @__PURE__ */ jsxs("div", { style: { display: "flex", alignItems: "center", gap: 8 }, children: [
            widgetState === "recording" && /* @__PURE__ */ jsx("span", { style: {
              width: 10,
              height: 10,
              borderRadius: 5,
              backgroundColor: "#fff",
              display: "inline-block",
              animation: "feedback-pulse 1.5s ease-in-out infinite"
            } }),
            widgetState === "chatting" && /* @__PURE__ */ jsx(ChatIcon, { size: 16 }),
            /* @__PURE__ */ jsx("span", { style: { fontSize: 14, fontWeight: 600 }, children: headerTitle })
          ] }),
          widgetState !== "submitting" && widgetState !== "submitted" && /* @__PURE__ */ jsx(
            "button",
            {
              onClick: () => {
                if (widgetState === "recording" || widgetState === "chatting") {
                  setIsExpanded(false);
                } else {
                  setIsExpanded(false);
                  handleReset();
                }
              },
              style: {
                background: "none",
                border: "none",
                color: "#fff",
                cursor: "pointer",
                fontSize: 18,
                lineHeight: 1,
                padding: "0 4px"
              },
              children: widgetState === "recording" || widgetState === "chatting" ? "\u2212" : "\xD7"
            }
          )
        ] }),
        /* @__PURE__ */ jsxs("div", { style: { padding: widgetState === "chatting" ? 0 : 16, flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }, children: [
          (widgetState === "error" || recorder.error) && /* @__PURE__ */ jsxs("div", { style: { padding: widgetState === "chatting" ? 12 : 0, marginBottom: 12 }, children: [
            /* @__PURE__ */ jsx("div", { style: {
              padding: "10px 12px",
              borderRadius: 8,
              backgroundColor: "#FEF2F2",
              color: "#991B1B",
              fontSize: 13,
              lineHeight: 1.4
            }, children: errorMessage || recorder.error || chat.error }),
            /* @__PURE__ */ jsx("button", { onClick: handleReset, style: {
              marginTop: 8,
              padding: "6px 14px",
              borderRadius: 6,
              border: "1px solid #D1D5DB",
              backgroundColor: "#fff",
              color: "#374151",
              fontSize: 13,
              cursor: "pointer"
            }, children: "Try Again" })
          ] }),
          widgetState === "submitted" && /* @__PURE__ */ jsx("div", { style: { textAlign: "center", padding: "8px 0" }, children: /* @__PURE__ */ jsx("p", { style: { fontSize: 14, color: "#374151", margin: 0 }, children: "Your feedback has been recorded and will be reviewed." }) }),
          widgetState === "submitting" && /* @__PURE__ */ jsxs("div", { style: { textAlign: "center", padding: "8px 0" }, children: [
            /* @__PURE__ */ jsx("p", { style: { fontSize: 14, color: "#6B7280", margin: 0 }, children: "Uploading your feedback..." }),
            submittingTooLong && /* @__PURE__ */ jsxs(Fragment, { children: [
              /* @__PURE__ */ jsx("p", { style: { fontSize: 12, color: "#9CA3AF", margin: "8px 0 4px 0" }, children: "This is taking longer than expected." }),
              /* @__PURE__ */ jsx("button", { onClick: handleReset, style: {
                marginTop: 4,
                padding: "6px 14px",
                borderRadius: 6,
                border: "1px solid #D1D5DB",
                backgroundColor: "#fff",
                color: "#374151",
                fontSize: 13,
                cursor: "pointer"
              }, children: "Cancel" })
            ] })
          ] }),
          widgetState === "idle" && !recorder.error && !errorMessage && /* @__PURE__ */ jsxs(Fragment, { children: [
            /* @__PURE__ */ jsx("p", { style: { fontSize: 13, color: "#6B7280", margin: "0 0 12px 0", lineHeight: 1.4 }, children: chatEnabled ? "Chat or record while you navigate \u2014 we track which page you're on automatically. Click around the app to show us exactly where something needs attention." : "Hit record and navigate the app \u2014 we'll track which page you're on. Talk through what you see as you click around." }),
            /* @__PURE__ */ jsxs("div", { style: { marginBottom: 14 }, children: [
              /* @__PURE__ */ jsx("label", { style: { fontSize: 12, color: "#9CA3AF", fontWeight: 500, display: "block", marginBottom: 6 }, children: "Category" }),
              /* @__PURE__ */ jsx("div", { style: { display: "flex", gap: 6, flexWrap: "wrap" }, children: CATEGORIES.map((cat) => /* @__PURE__ */ jsxs(
                "button",
                {
                  onClick: () => setCategory(cat.value),
                  style: {
                    padding: "5px 12px",
                    borderRadius: 16,
                    border: `2px solid ${category === cat.value ? "#0D9488" : "#E5E7EB"}`,
                    backgroundColor: category === cat.value ? "#F0FDFA" : "#fff",
                    color: category === cat.value ? "#0D9488" : "#6B7280",
                    fontSize: 13,
                    fontWeight: 500,
                    cursor: "pointer",
                    transition: "all 0.15s"
                  },
                  children: [
                    cat.icon,
                    " ",
                    cat.label
                  ]
                },
                cat.value
              )) })
            ] }),
            /* @__PURE__ */ jsxs("div", { style: { display: "flex", gap: 8 }, children: [
              chatEnabled && /* @__PURE__ */ jsxs(
                "button",
                {
                  onClick: handleStartChat,
                  style: {
                    flex: 1,
                    padding: "10px 0",
                    borderRadius: 8,
                    border: "none",
                    backgroundColor: "#0D9488",
                    color: "#fff",
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    transition: "background-color 0.15s"
                  },
                  onMouseEnter: (e) => e.currentTarget.style.backgroundColor = "#0F766E",
                  onMouseLeave: (e) => e.currentTarget.style.backgroundColor = "#0D9488",
                  children: [
                    /* @__PURE__ */ jsx(ChatIcon, { size: 16 }),
                    "Chat"
                  ]
                }
              ),
              /* @__PURE__ */ jsxs(
                "button",
                {
                  onClick: handleStartRecording,
                  style: {
                    flex: 1,
                    padding: "10px 0",
                    borderRadius: 8,
                    border: "none",
                    backgroundColor: "#EF4444",
                    color: "#fff",
                    fontSize: 14,
                    fontWeight: 600,
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 8,
                    transition: "background-color 0.15s"
                  },
                  onMouseEnter: (e) => e.currentTarget.style.backgroundColor = "#DC2626",
                  onMouseLeave: (e) => e.currentTarget.style.backgroundColor = "#EF4444",
                  children: [
                    /* @__PURE__ */ jsx(MicIcon, { size: 16 }),
                    chatEnabled ? "Voice" : "Start Recording"
                  ]
                }
              )
            ] })
          ] }),
          widgetState === "recording" && /* @__PURE__ */ jsxs(Fragment, { children: [
            /* @__PURE__ */ jsx("p", { style: { fontSize: 11, color: "#9CA3AF", margin: "0 0 8px 0", lineHeight: 1.4, fontStyle: "italic" }, children: "Navigate around \u2014 we're tracking where you are." }),
            /* @__PURE__ */ jsxs("div", { style: {
              padding: "8px 12px",
              borderRadius: 8,
              backgroundColor: "#F9FAFB",
              marginBottom: 12,
              fontSize: 12,
              color: "#6B7280"
            }, children: [
              /* @__PURE__ */ jsxs("div", { style: { display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }, children: [
                /* @__PURE__ */ jsx("span", { style: { fontWeight: 600, color: "#374151" }, children: "Page:" }),
                /* @__PURE__ */ jsx("span", { style: { fontFamily: "monospace" }, children: tracker.getCurrentContext().route })
              ] }),
              tracker.getCurrentContext().viewportSection && /* @__PURE__ */ jsxs("div", { style: { display: "flex", alignItems: "center", gap: 6 }, children: [
                /* @__PURE__ */ jsx("span", { style: { fontWeight: 600, color: "#374151" }, children: "Section:" }),
                /* @__PURE__ */ jsx("span", { children: tracker.getCurrentContext().viewportSection })
              ] })
            ] }),
            /* @__PURE__ */ jsx("div", { style: { display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 12 }, children: CATEGORIES.map((cat) => /* @__PURE__ */ jsxs(
              "button",
              {
                onClick: () => setCategory(cat.value),
                style: {
                  padding: "3px 10px",
                  borderRadius: 12,
                  border: `1.5px solid ${category === cat.value ? "#0D9488" : "#E5E7EB"}`,
                  backgroundColor: category === cat.value ? "#F0FDFA" : "#fff",
                  color: category === cat.value ? "#0D9488" : "#9CA3AF",
                  fontSize: 12,
                  cursor: "pointer"
                },
                children: [
                  cat.icon,
                  " ",
                  cat.label
                ]
              },
              cat.value
            )) }),
            /* @__PURE__ */ jsxs(
              "button",
              {
                onClick: handleStopRecording,
                style: {
                  width: "100%",
                  padding: "10px 0",
                  borderRadius: 8,
                  border: "none",
                  backgroundColor: "#374151",
                  color: "#fff",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8
                },
                children: [
                  /* @__PURE__ */ jsx("svg", { width: "14", height: "14", viewBox: "0 0 24 24", fill: "currentColor", children: /* @__PURE__ */ jsx("rect", { x: "6", y: "6", width: "12", height: "12", rx: "2" }) }),
                  "Stop & Submit"
                ]
              }
            )
          ] }),
          widgetState === "chatting" && /* @__PURE__ */ jsxs(Fragment, { children: [
            renderChatMessages(),
            renderChatInput(),
            /* @__PURE__ */ jsx("div", { style: {
              padding: "6px 12px",
              borderTop: "1px solid #F3F4F6",
              display: "flex",
              justifyContent: "flex-end"
            }, children: /* @__PURE__ */ jsx(
              "button",
              {
                onClick: handleEndChat,
                style: {
                  padding: "5px 14px",
                  borderRadius: 6,
                  border: "none",
                  backgroundColor: "#374151",
                  color: "#fff",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer"
                },
                children: "End & Submit"
              }
            ) })
          ] })
        ] }),
        /* @__PURE__ */ jsx("style", { children: `
        @keyframes feedback-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      ` })
      ]
    }
  );
}

export { FeedbackWidget, useChatApi, useEventTracker, useFeedbackApi, useScreenshotAnnotation, useVoiceRecorder };
//# sourceMappingURL=index.mjs.map
//# sourceMappingURL=index.mjs.map