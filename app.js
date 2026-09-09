"use strict";

const FIELD_DEFINITIONS = [
  { name: "序號", type: "readonly" },
  { name: "學號", type: "readonly" },
  { name: "姓名", type: "readonly" },
  { name: "電話", type: "readonly" },
  { name: "加入班群", type: "status" },
  { name: "租賃校外調查表", type: "status" },
  { name: "住宿", type: "housing" },
  { name: "租屋地址", type: "text", conditional: "offCampus" },
  { name: "宿舍", type: "readonly", conditional: "dormitory" },
  { name: "到校交通工具", type: "transport" },
  { name: "交通工具", type: "text", conditional: "otherTransport" },
  { name: "新生線上心理健檢活動", type: "status" },
  { name: "UCAN系統", type: "status" },
  { name: "新生問卷", type: "status" },
];

const STATUS_FIELDS = new Set(FIELD_DEFINITIONS.filter((field) => field.type === "status").map((field) => field.name));
const EDITABLE_FIELDS = FIELD_DEFINITIONS.filter((field) => field.type !== "readonly").map((field) => field.name);
const HOUSING_OPTIONS = ["住宿", "在外租屋"];
const TRANSPORT_OPTIONS = ["家長接送", "大眾運輸", "自行開車", "機車", "步行", "其他"];
const EMPTY_LABEL = "未完成/未回報";

const form = document.getElementById("search-form");
const nameInput = document.getElementById("name");
const phoneInput = document.getElementById("phone");
const searchButton = document.getElementById("search-button");
const message = document.getElementById("message");
const results = document.getElementById("results");
let currentSession = null;

form.addEventListener("submit", handleSearch);

async function handleSearch(event) {
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

  setSearchLoading(true);
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 15000);

  try {
    const url = new URL(apiUrl);
    url.searchParams.set("name", name);
    url.searchParams.set("phone", phone);
    const response = await fetch(url, { method: "GET", cache: "no-store", signal: controller.signal });
    const payload = await readJsonResponse(response);

    if (!payload.ok || !Array.isArray(payload.data)) {
      showMessage(payload.error || "查詢服務暫時無法使用，請稍後再試。", true);
      return;
    }
    if (payload.data.length === 0) {
      showMessage("查無資料，請確認姓名與電話是否正確。", true);
      return;
    }
    if (payload.data.length !== 1) {
      showMessage("查詢資料重複，請聯絡管理人員。", true);
      return;
    }

    currentSession = { name, phone, original: payload.data[0] };
    renderEditor(payload.data[0]);
  } catch (error) {
    handleRequestError(error);
  } finally {
    window.clearTimeout(timeoutId);
    setSearchLoading(false);
  }
}

async function handleSave(event) {
  event.preventDefault();
  if (!currentSession) {
    showMessage("查詢狀態已失效，請重新查詢。", true);
    return;
  }

  const editor = event.currentTarget;
  syncConditionalFields(editor);
  if (!editor.reportValidity()) return;

  const updates = buildUpdates(editor, currentSession.original);
  if (Object.keys(updates).length === 0) {
    showMessage("目前沒有需要儲存的變更。", false);
    updateSaveButton(editor);
    return;
  }

  const saveButton = editor.querySelector("[data-save]");
  setSaveLoading(saveButton, true);
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 20000);

  try {
    const body = new URLSearchParams({
      name: currentSession.name,
      phone: currentSession.phone,
      updates: JSON.stringify(updates),
    });
    const response = await fetch(getApiUrl(), { method: "POST", body, cache: "no-store", signal: controller.signal });
    const payload = await readJsonResponse(response);

    if (!payload.ok || !Array.isArray(payload.data) || payload.data.length !== 1) {
      showMessage(payload.error || "資料儲存失敗，請稍後再試。", true);
      return;
    }

    currentSession.original = payload.data[0];
    renderEditor(payload.data[0]);
    showMessage("資料已儲存。", false);
  } catch (error) {
    handleRequestError(error, "資料儲存失敗，請稍後再試。");
  } finally {
    window.clearTimeout(timeoutId);
    if (saveButton.isConnected) setSaveLoading(saveButton, false);
  }
}

async function readJsonResponse(response) {
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

function handleRequestError(error, fallback = "查詢服務暫時無法使用，請稍後再試。") {
  showMessage(error.name === "AbortError" ? "連線逾時，請稍後再試。" : fallback, true);
  console.error("Student data request failed", error);
}

function renderEditor(record) {
  const editor = document.createElement("form");
  editor.className = "record-card editor";
  editor.addEventListener("submit", handleSave);
  editor.addEventListener("input", handleEditorChange);
  editor.addEventListener("change", handleEditorChange);

  const heading = document.createElement("h2");
  heading.className = "record-heading";
  heading.textContent = "查詢結果與資料更新";
  editor.appendChild(heading);

  const list = document.createElement("dl");
  list.className = "record-list";
  FIELD_DEFINITIONS.forEach((definition) => {
    const row = document.createElement("div");
    row.className = "record-row";
    row.dataset.rowFor = definition.name;
    if (definition.conditional) row.dataset.conditional = definition.conditional;

    const label = document.createElement("dt");
    label.textContent = definition.name;
    const value = document.createElement("dd");
    if (definition.type === "readonly") {
      renderReadonlyValue(value, record[definition.name]);
    } else {
      value.appendChild(createEditorControl(definition, record[definition.name]));
      if (definition.type === "status") {
        const note = document.createElement("small");
        note.className = "field-note";
        note.dataset.statusNote = definition.name;
        value.appendChild(note);
      }
    }
    row.append(label, value);
    list.appendChild(row);
  });
  editor.appendChild(list);

  const actions = document.createElement("div");
  actions.className = "record-actions";
  const saveButton = document.createElement("button");
  saveButton.type = "submit";
  saveButton.className = "save-button";
  saveButton.dataset.save = "";
  saveButton.textContent = "儲存變更";
  actions.appendChild(saveButton);
  editor.appendChild(actions);

  results.replaceChildren(editor);
  syncConditionalFields(editor);
  updateStatusNotes(editor);
  updateSaveButton(editor);
}

function createEditorControl(definition, rawValue) {
  const currentValue = canonicalEditorValue(definition, rawValue);
  if (definition.type === "text") {
    const input = document.createElement("input");
    input.type = "text";
    input.maxLength = 200;
    input.autocomplete = "off";
    input.value = currentValue;
    input.dataset.field = definition.name;
    input.setAttribute("aria-label", definition.name);
    return input;
  }

  const select = document.createElement("select");
  select.dataset.field = definition.name;
  select.setAttribute("aria-label", definition.name);
  if (definition.type === "status") {
    addOption(select, "", EMPTY_LABEL);
    addOption(select, "已完成", "已完成");
  } else {
    addOption(select, "", "請選擇", true);
    const options = definition.type === "housing" ? HOUSING_OPTIONS : TRANSPORT_OPTIONS;
    options.forEach((option) => addOption(select, option, option));
  }
  select.value = currentValue;
  return select;
}

function addOption(select, value, label, disabled = false) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = label;
  option.disabled = disabled;
  select.appendChild(option);
}

function canonicalEditorValue(definition, value) {
  const text = value == null ? "" : String(value).trim();
  if (definition.type === "status") return text === "已完成" ? "已完成" : "";
  if (definition.type === "housing") return HOUSING_OPTIONS.includes(text) ? text : "";
  if (definition.type === "transport") return TRANSPORT_OPTIONS.includes(text) ? text : "";
  return text;
}

function renderReadonlyValue(container, value) {
  const displayValue = normalizeDisplayValue(value);
  const status = statusClass(displayValue);
  if (!status) {
    container.textContent = displayValue;
    return;
  }
  const badge = document.createElement("span");
  badge.className = `status ${status}`;
  badge.textContent = displayValue;
  container.appendChild(badge);
}

function handleEditorChange(event) {
  const editor = event.currentTarget;
  syncConditionalFields(editor);
  updateStatusNotes(editor);
  updateSaveButton(editor);
  message.hidden = true;
}

function syncConditionalFields(editor) {
  const housing = fieldControl(editor, "住宿").value;
  const transport = fieldControl(editor, "到校交通工具").value;
  const offCampusInput = fieldControl(editor, "租屋地址");
  const otherTransportInput = fieldControl(editor, "交通工具");
  const isOffCampus = housing === "在外租屋";
  const isOtherTransport = transport === "其他";

  editor.querySelector('[data-conditional="offCampus"]').hidden = !isOffCampus;
  editor.querySelector('[data-conditional="dormitory"]').hidden = housing !== "住宿";
  editor.querySelector('[data-conditional="otherTransport"]').hidden = !isOtherTransport;
  offCampusInput.required = isOffCampus;
  otherTransportInput.required = isOtherTransport;
  if (!isOffCampus) offCampusInput.value = "";
  if (!isOtherTransport) otherTransportInput.value = "";
}

function updateStatusNotes(editor) {
  STATUS_FIELDS.forEach((field) => {
    editor.querySelector(`[data-status-note="${field}"]`).textContent = fieldControl(editor, field).value ? "" : EMPTY_LABEL;
  });
}

function updateSaveButton(editor) {
  const saveButton = editor.querySelector("[data-save]");
  if (saveButton && currentSession) {
    saveButton.disabled = Object.keys(buildUpdates(editor, currentSession.original)).length === 0;
  }
}

function buildUpdates(editor, original) {
  const updates = {};
  EDITABLE_FIELDS.forEach((field) => {
    const targetValue = fieldControl(editor, field).value.trim();
    const originalValue = String(original[field] || "").trim();
    if (targetValue !== originalValue) updates[field] = targetValue;
  });
  return updates;
}

function fieldControl(editor, field) {
  return editor.querySelector(`[data-field="${field}"]`);
}

function getApiUrl() {
  return window.STUDENT_LOOKUP_CONFIG?.apiUrl || "";
}

function isConfiguredApiUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "script.google.com" && url.pathname.endsWith("/exec");
  } catch {
    return false;
  }
}

function clearOutput() {
  currentSession = null;
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

function setSearchLoading(isLoading) {
  searchButton.disabled = isLoading;
  searchButton.textContent = isLoading ? "查詢中…" : "查詢";
}

function setSaveLoading(button, isLoading) {
  button.disabled = isLoading;
  button.textContent = isLoading ? "儲存中…" : "儲存變更";
}

function normalizeDisplayValue(value) {
  const text = value == null ? "" : String(value).trim();
  return !text || text === "未完成" ? EMPTY_LABEL : text;
}

function statusClass(value) {
  if (value === "已完成" || value === "住宿") return "success";
  if (value === EMPTY_LABEL) return "neutral";
  return "";
}
