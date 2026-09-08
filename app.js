"use strict";

const FIELDS = [
  "序號",
  "學號",
  "姓名",
  "電話",
  "加入班群",
  "租賃校外調查表",
  "住宿",
  "宿舍",
  "到校交通工具",
  "新生線上心理健檢活動",
  "UCAN系統",
  "新生問卷",
];

const form = document.getElementById("search-form");
const nameInput = document.getElementById("name");
const phoneInput = document.getElementById("phone");
const searchButton = document.getElementById("search-button");
const message = document.getElementById("message");
const results = document.getElementById("results");

form.addEventListener("submit", handleSubmit);

async function handleSubmit(event) {
  event.preventDefault();
  clearOutput();

  const name = nameInput.value.trim();
  const phone = phoneInput.value.trim();

  if (!name || !phone) {
    showMessage("請輸入完整的姓名與電話。", true);
    (!name ? nameInput : phoneInput).focus();
    return;
  }

  const apiUrl = getApiUrl();
  if (!isConfiguredApiUrl(apiUrl)) {
    showMessage("查詢服務尚未完成設定，請聯絡管理人員。", true);
    return;
  }

  setLoading(true);
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 15000);

  try {
    const url = new URL(apiUrl);
    url.searchParams.set("name", name);
    url.searchParams.set("phone", phone);

    const response = await fetch(url, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const payload = await response.json();
    if (!payload || payload.ok !== true || !Array.isArray(payload.data)) {
      showMessage(payload?.error || "查詢服務暫時無法使用，請稍後再試。", true);
      return;
    }

    if (payload.data.length === 0) {
      showMessage("查無資料，請確認姓名與電話是否正確。", true);
      return;
    }

    renderRecords(payload.data);
  } catch (error) {
    const text = error.name === "AbortError"
      ? "查詢逾時，請稍後再試。"
      : "查詢服務暫時無法使用，請稍後再試。";
    showMessage(text, true);
    console.error("Student lookup failed", error);
  } finally {
    window.clearTimeout(timeoutId);
    setLoading(false);
  }
}

function getApiUrl() {
  return window.STUDENT_LOOKUP_CONFIG?.apiUrl || "";
}

function isConfiguredApiUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:"
      && url.hostname === "script.google.com"
      && url.pathname.endsWith("/exec");
  } catch {
    return false;
  }
}

function clearOutput() {
  message.hidden = true;
  message.textContent = "";
  message.classList.remove("error");
  results.replaceChildren();
}

function showMessage(text, isError = false) {
  message.textContent = text;
  message.classList.toggle("error", isError);
  message.hidden = false;
}

function setLoading(isLoading) {
  searchButton.disabled = isLoading;
  searchButton.textContent = isLoading ? "查詢中…" : "查詢";
}

function renderRecords(records) {
  const fragment = document.createDocumentFragment();

  records.forEach((record, index) => {
    const card = document.createElement("article");
    card.className = "record-card";

    const heading = document.createElement("h2");
    heading.className = "record-heading";
    heading.textContent = records.length === 1 ? "查詢結果" : `查詢結果 ${index + 1}`;
    card.appendChild(heading);

    const list = document.createElement("dl");
    list.className = "record-list";

    FIELDS.forEach((field) => {
      const row = document.createElement("div");
      row.className = "record-row";

      const label = document.createElement("dt");
      label.textContent = field;

      const value = document.createElement("dd");
      const displayValue = normalizeDisplayValue(record[field]);

      const status = statusClass(displayValue);
      if (status) {
        const badge = document.createElement("span");
        badge.className = `status ${status}`;
        badge.textContent = displayValue;
        value.appendChild(badge);
      } else {
        value.textContent = displayValue;
      }

      row.append(label, value);
      list.appendChild(row);
    });

    card.appendChild(list);
    fragment.appendChild(card);
  });

  results.replaceChildren(fragment);
}

function normalizeDisplayValue(value) {
  const text = value == null ? "" : String(value).trim();
  return text || "未回報";
}

function statusClass(value) {
  if (value === "已完成" || value === "住宿") {
    return "success";
  }
  if (value === "未完成") {
    return "danger";
  }
  if (value === "未回報") {
    return "neutral";
  }
  return "";
}
