const API_BASE_URL = ["localhost", "127.0.0.1"].includes(window.location.hostname)
  ? "http://localhost:8080"
  : "https://proyecto1webbackend-production.up.railway.app";

const state = {
  page: 1,
  limit: 6,
  totalPages: 1,
  search: "",
  sort: "id",
  order: "asc",
  data: [],
  editingId: null,
};

const elements = {
  form: document.getElementById("seriesForm"),
  formTitle: document.getElementById("formTitle"),
  formSubtitle: document.getElementById("formSubtitle"),
  seriesId: document.getElementById("seriesId"),
  titleInput: document.getElementById("titleInput"),
  descriptionInput: document.getElementById("descriptionInput"),
  episodesInput: document.getElementById("episodesInput"),
  imageInput: document.getElementById("imageInput"),
  cancelEditButton: document.getElementById("cancelEditButton"),
  refreshButton: document.getElementById("refreshButton"),
  exportButton: document.getElementById("exportButton"),
  searchInput: document.getElementById("searchInput"),
  sortSelect: document.getElementById("sortSelect"),
  limitSelect: document.getElementById("limitSelect"),
  seriesGrid: document.getElementById("seriesGrid"),
  statusText: document.getElementById("statusText"),
  pageInfo: document.getElementById("pageInfo"),
  prevButton: document.getElementById("prevButton"),
  nextButton: document.getElementById("nextButton"),
};

elements.searchInput.addEventListener("input", debounce((event) => {
  state.search = event.target.value.trim();
  state.page = 1;
  fetchSeries();
}, 350));

elements.sortSelect.addEventListener("change", (event) => {
  const [sort, order] = event.target.value.split("-");
  state.sort = sort;
  state.order = order;
  state.page = 1;
  fetchSeries();
});

elements.limitSelect.addEventListener("change", (event) => {
  state.limit = Number(event.target.value);
  state.page = 1;
  fetchSeries();
});

elements.prevButton.addEventListener("click", () => {
  if (state.page > 1) {
    state.page -= 1;
    fetchSeries();
  }
});

elements.nextButton.addEventListener("click", () => {
  if (state.page < state.totalPages) {
    state.page += 1;
    fetchSeries();
  }
});

elements.refreshButton.addEventListener("click", fetchSeries);
elements.exportButton.addEventListener("click", exportExcel);
elements.cancelEditButton.addEventListener("click", resetForm);

elements.form.addEventListener("submit", async (event) => {
  event.preventDefault();

  const payload = {
    title: elements.titleInput.value.trim(),
    description: elements.descriptionInput.value.trim(),
    episodes: Number(elements.episodesInput.value),
    image: elements.imageInput.value.trim(),
  };

  if (!payload.title || !payload.description || !payload.image || payload.episodes <= 0) {
    setStatus("Please complete all fields with valid values.");
    return;
  }

  if (!isSupportedHttpUrl(payload.image)) {
    setStatus("The image URL must start with http:// or https://.");
    return;
  }

  const endpoint = state.editingId ? `/series/${state.editingId}` : "/series";
  const method = state.editingId ? "PUT" : "POST";
  const wasEditing = Boolean(state.editingId);

  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, {
      method,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorBody = await response.json();
      throw new Error(errorBody.error || "Request failed");
    }

    resetForm();
    await fetchSeries();
    setStatus(wasEditing ? "Series updated successfully." : "Series created successfully.");
  } catch (error) {
    setStatus(error.message);
  }
});

async function fetchSeries() {
  const params = new URLSearchParams({
    page: String(state.page),
    limit: String(state.limit),
    sort: state.sort,
    order: state.order,
  });

  if (state.search) {
    params.set("q", state.search);
  }

  setStatus("Loading series...");

  try {
    const response = await fetch(`${API_BASE_URL}/series?${params.toString()}`);
    if (!response.ok) {
      const errorBody = await response.json();
      throw new Error(errorBody.error || "Could not load series");
    }

    const result = await response.json();
    state.data = result.data;
    state.page = result.page;
    state.totalPages = Math.max(result.total_pages || 1, 1);

    renderSeries(result.data);
    updatePagination(result.total, result.page, result.total_pages);
  } catch (error) {
    state.data = [];
    renderSeries([]);
    setStatus(error.message);
    elements.pageInfo.textContent = "Page 1 of 1";
  }
}

function renderSeries(seriesList) {
  elements.exportButton.disabled = seriesList.length === 0;

  if (seriesList.length === 0) {
    elements.seriesGrid.innerHTML = `
      <div class="empty-state">
        <h3>No series found</h3>
        <p>Try adjusting the search or add a new series from the form.</p>
      </div>
    `;
    return;
  }

  elements.seriesGrid.innerHTML = seriesList.map((item) => {
    const average = item.rating_count > 0
      ? `${Number(item.rating_average).toFixed(1)} / 5`
      : "No ratings yet";

    return `
      <article class="series-card">
        <img src="${escapeHTML(getSafeImageUrl(item.image))}" alt="${escapeHTML(item.title)}" onerror="this.src='https://placehold.co/600x400?text=No+Image';" />
        <div class="card-content">
          <div class="card-meta">${item.episodes} episodes</div>
          <h3>${escapeHTML(item.title)}</h3>
          <p>${escapeHTML(item.description)}</p>

          <div class="rating-summary">
            <span class="rating-label">Rating</span>
            <strong>${average}</strong>
            <span class="rating-count">(${item.rating_count} vote${item.rating_count === 1 ? "" : "s"})</span>
          </div>

          <div class="rating-controls">
            <input id="reviewer-${item.id}" type="text" maxlength="40" placeholder="Your name (optional)" />
            <div class="rating-actions">
              <select id="rating-${item.id}">
                <option value="5">5 stars</option>
                <option value="4">4 stars</option>
                <option value="3" selected>3 stars</option>
                <option value="2">2 stars</option>
                <option value="1">1 star</option>
              </select>
              <button class="primary-button" type="button" onclick="submitRating(${item.id})">Rate</button>
              <button class="ghost-button" type="button" onclick="toggleRatings(${item.id})">View Ratings</button>
            </div>
          </div>

          <div id="ratingDetails-${item.id}" class="rating-details hidden"></div>

          <div class="card-actions">
            <button class="primary-button" type="button" onclick="startEdit(${item.id})">Edit</button>
            <button class="secondary-button" type="button" onclick="removeSeries(${item.id})">Delete</button>
          </div>
        </div>
      </article>
    `;
  }).join("");
}

function updatePagination(total, page, totalPages) {
  elements.pageInfo.textContent = `Page ${page} of ${Math.max(totalPages || 1, 1)}`;
  elements.prevButton.disabled = page <= 1;
  elements.nextButton.disabled = totalPages === 0 || page >= totalPages;
  setStatus(`Showing ${state.data.length} result(s) from ${total} total series.`);
}

async function startEdit(id) {
  try {
    const response = await fetch(`${API_BASE_URL}/series/${id}`);
    if (!response.ok) {
      const errorBody = await response.json();
      throw new Error(errorBody.error || "Could not load series");
    }

    const item = await response.json();
    state.editingId = item.id;
    elements.seriesId.value = item.id;
    elements.titleInput.value = item.title;
    elements.descriptionInput.value = item.description;
    elements.episodesInput.value = item.episodes;
    elements.imageInput.value = item.image;
    elements.formTitle.textContent = "Edit Series";
    elements.formSubtitle.textContent = "Update the selected series and save the changes.";
    elements.cancelEditButton.classList.remove("hidden");
    window.scrollTo({ top: 0, behavior: "smooth" });
  } catch (error) {
    setStatus(error.message);
  }
}

async function removeSeries(id) {
  const confirmed = window.confirm("Are you sure you want to delete this series?");
  if (!confirmed) {
    return;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/series/${id}`, {
      method: "DELETE",
    });

    if (!response.ok && response.status !== 204) {
      const errorBody = await response.json();
      throw new Error(errorBody.error || "Could not delete series");
    }

    if (state.data.length === 1 && state.page > 1) {
      state.page -= 1;
    }

    await fetchSeries();
    setStatus("Series deleted successfully.");
  } catch (error) {
    setStatus(error.message);
  }
}

async function submitRating(seriesId) {
  const select = document.getElementById(`rating-${seriesId}`);
  const reviewerInput = document.getElementById(`reviewer-${seriesId}`);
  const score = Number(select?.value || 0);
  const reviewer = reviewerInput?.value.trim() || "";

  try {
    const response = await fetch(`${API_BASE_URL}/series/${seriesId}/rating`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ reviewer, score }),
    });

    if (!response.ok) {
      const errorBody = await response.json();
      throw new Error(errorBody.error || "Could not save rating");
    }

    if (reviewerInput) {
      reviewerInput.value = "";
    }

    await fetchSeries();
    setStatus("Rating saved successfully.");
  } catch (error) {
    setStatus(error.message);
  }
}

async function toggleRatings(seriesId) {
  const container = document.getElementById(`ratingDetails-${seriesId}`);
  if (!container) {
    return;
  }

  if (!container.classList.contains("hidden")) {
    container.classList.add("hidden");
    container.innerHTML = "";
    return;
  }

  container.classList.remove("hidden");
  container.innerHTML = `<p class="rating-loading">Loading ratings...</p>`;

  try {
    const response = await fetch(`${API_BASE_URL}/series/${seriesId}/rating`);
    if (!response.ok) {
      const errorBody = await response.json();
      throw new Error(errorBody.error || "Could not load ratings");
    }

    const result = await response.json();
    container.innerHTML = renderRatingDetails(result);
  } catch (error) {
    container.innerHTML = `<p class="rating-loading">${escapeHTML(error.message)}</p>`;
  }
}

async function deleteRating(seriesId, ratingId) {
  try {
    const response = await fetch(`${API_BASE_URL}/series/${seriesId}/rating/${ratingId}`, {
      method: "DELETE",
    });

    if (!response.ok && response.status !== 204) {
      const errorBody = await response.json();
      throw new Error(errorBody.error || "Could not delete rating");
    }

    await fetchSeries();
    setStatus("Rating deleted successfully.");
  } catch (error) {
    setStatus(error.message);
  }
}

function renderRatingDetails(result) {
  const summary = `
    <div class="rating-details-header">
      <strong>${Number(result.average || 0).toFixed(1)} / 5</strong>
      <span>${result.count} total rating${result.count === 1 ? "" : "s"}</span>
    </div>
  `;

  if (!result.latest_ratings || result.latest_ratings.length === 0) {
    return `${summary}<p class="rating-loading">No ratings yet for this series.</p>`;
  }

  const ratingsMarkup = result.latest_ratings.map((rating) => `
    <li class="rating-item">
      <div>
        <strong>${"★".repeat(rating.score)}${"☆".repeat(5 - rating.score)}</strong>
        <span>${escapeHTML(rating.reviewer || "Anonymous")}</span>
      </div>
      <div class="rating-item-meta">
        <span>${formatDate(rating.created_at)}</span>
        <button class="ghost-button" type="button" onclick="deleteRating(${rating.series_id}, ${rating.id})">Delete</button>
      </div>
    </li>
  `).join("");

  return `${summary}<ul class="rating-list">${ratingsMarkup}</ul>`;
}

function resetForm() {
  state.editingId = null;
  elements.form.reset();
  elements.seriesId.value = "";
  elements.formTitle.textContent = "Add New Series";
  elements.formSubtitle.textContent = "Fill in all fields to create a new record.";
  elements.cancelEditButton.classList.add("hidden");
}

function exportExcel() {
  if (state.data.length === 0) {
    setStatus("There is no data to export on the current page.");
    return;
  }

  try {
    const rows = [
      ["ID", "Title", "Description", "Episodes", "Image URL", "Average Rating", "Rating Count"],
      ...state.data.map((item) => [
        item.id,
        item.title,
        item.description,
        item.episodes,
        item.image,
        Number(item.rating_average || 0).toFixed(1),
        item.rating_count || 0,
      ]),
    ];

    const workbookBytes = buildWorkbookArchive("Series", rows);
    const blob = new Blob(
      [workbookBytes],
      { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" },
    );

    triggerDownload(blob, "series.xlsx");
    setStatus("Excel exported successfully.");
  } catch (error) {
    setStatus(`Could not export Excel: ${error.message}`);
  }
}

function buildWorkbookArchive(sheetName, rows) {
  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`;

  const packageRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;

  const workbookXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="${escapeXmlAttribute(sheetName)}" sheetId="1" r:id="rId1"/>
  </sheets>
</workbook>`;

  const workbookRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
</Relationships>`;

  const appXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>Series Manager</Application>
</Properties>`;

  const now = new Date().toISOString();
  const coreXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>Series Export</dc:title>
  <dc:creator>Series Manager</dc:creator>
  <cp:lastModifiedBy>Series Manager</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified>
</cp:coreProperties>`;

  const sheetXml = buildWorksheetXml(rows);

  return createZipArchive([
    { name: "[Content_Types].xml", content: contentTypesXml },
    { name: "_rels/.rels", content: packageRelsXml },
    { name: "docProps/app.xml", content: appXml },
    { name: "docProps/core.xml", content: coreXml },
    { name: "xl/workbook.xml", content: workbookXml },
    { name: "xl/_rels/workbook.xml.rels", content: workbookRelsXml },
    { name: "xl/worksheets/sheet1.xml", content: sheetXml },
  ]);
}

function buildWorksheetXml(rows) {
  const rowMarkup = rows.map((row, rowIndex) => {
    const cells = row.map((value, columnIndex) => {
      const cellRef = `${getExcelColumnName(columnIndex + 1)}${rowIndex + 1}`;
      return createWorksheetCell(cellRef, value);
    }).join("");

    return `<row r="${rowIndex + 1}">${cells}</row>`;
  }).join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>${rowMarkup}</sheetData>
</worksheet>`;
}

function createWorksheetCell(reference, value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return `<c r="${reference}"><v>${value}</v></c>`;
  }

  const text = String(value ?? "");
  return `<c r="${reference}" t="inlineStr"><is><t xml:space="preserve">${escapeXmlText(text)}</t></is></c>`;
}

function createZipArchive(entries) {
  const encoder = new TextEncoder();
  const fileEntries = entries.map((entry) => {
    const nameBytes = encoder.encode(entry.name);
    const dataBytes = encoder.encode(entry.content);
    return {
      nameBytes,
      dataBytes,
      crc: crc32(dataBytes),
      mod: getDosDateTime(new Date()),
    };
  });

  const localParts = [];
  const centralParts = [];
  let offset = 0;

  for (const entry of fileEntries) {
    const localHeader = createLocalFileHeader(entry);
    localParts.push(localHeader, entry.dataBytes);

    const centralHeader = createCentralDirectoryHeader(entry, offset);
    centralParts.push(centralHeader);

    offset += localHeader.length + entry.dataBytes.length;
  }

  const centralDirectory = concatUint8Arrays(centralParts);
  const localData = concatUint8Arrays(localParts);
  const endRecord = createEndOfCentralDirectoryRecord(centralDirectory.length, offset, fileEntries.length);

  return concatUint8Arrays([localData, centralDirectory, endRecord]);
}

function createLocalFileHeader(entry) {
  const header = new Uint8Array(30 + entry.nameBytes.length);
  const view = new DataView(header.buffer);
  const flags = 0x0800;

  view.setUint32(0, 0x04034b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, flags, true);
  view.setUint16(8, 0, true);
  view.setUint16(10, entry.mod.time, true);
  view.setUint16(12, entry.mod.date, true);
  view.setUint32(14, entry.crc, true);
  view.setUint32(18, entry.dataBytes.length, true);
  view.setUint32(22, entry.dataBytes.length, true);
  view.setUint16(26, entry.nameBytes.length, true);
  view.setUint16(28, 0, true);
  header.set(entry.nameBytes, 30);

  return header;
}

function createCentralDirectoryHeader(entry, offset) {
  const header = new Uint8Array(46 + entry.nameBytes.length);
  const view = new DataView(header.buffer);
  const flags = 0x0800;

  view.setUint32(0, 0x02014b50, true);
  view.setUint16(4, 20, true);
  view.setUint16(6, 20, true);
  view.setUint16(8, flags, true);
  view.setUint16(10, 0, true);
  view.setUint16(12, entry.mod.time, true);
  view.setUint16(14, entry.mod.date, true);
  view.setUint32(16, entry.crc, true);
  view.setUint32(20, entry.dataBytes.length, true);
  view.setUint32(24, entry.dataBytes.length, true);
  view.setUint16(28, entry.nameBytes.length, true);
  view.setUint16(30, 0, true);
  view.setUint16(32, 0, true);
  view.setUint16(34, 0, true);
  view.setUint16(36, 0, true);
  view.setUint32(38, 0, true);
  view.setUint32(42, offset, true);
  header.set(entry.nameBytes, 46);

  return header;
}

function createEndOfCentralDirectoryRecord(centralDirectorySize, centralDirectoryOffset, totalEntries) {
  const record = new Uint8Array(22);
  const view = new DataView(record.buffer);

  view.setUint32(0, 0x06054b50, true);
  view.setUint16(4, 0, true);
  view.setUint16(6, 0, true);
  view.setUint16(8, totalEntries, true);
  view.setUint16(10, totalEntries, true);
  view.setUint32(12, centralDirectorySize, true);
  view.setUint32(16, centralDirectoryOffset, true);
  view.setUint16(20, 0, true);

  return record;
}

function getDosDateTime(date) {
  const safeDate = new Date(date);
  const year = Math.max(safeDate.getFullYear(), 1980);
  const dosTime = (safeDate.getSeconds() >> 1)
    | (safeDate.getMinutes() << 5)
    | (safeDate.getHours() << 11);
  const dosDate = safeDate.getDate()
    | ((safeDate.getMonth() + 1) << 5)
    | ((year - 1980) << 9);

  return { time: dosTime, date: dosDate };
}

function concatUint8Arrays(parts) {
  const totalLength = parts.reduce((sum, item) => sum + item.length, 0);
  const merged = new Uint8Array(totalLength);
  let offset = 0;

  for (const part of parts) {
    merged.set(part, offset);
    offset += part.length;
  }

  return merged;
}

const CRC32_TABLE = createCrc32Table();

function createCrc32Table() {
  const table = new Uint32Array(256);

  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
    }
    table[index] = value >>> 0;
  }

  return table;
}

function crc32(bytes) {
  let crc = 0xffffffff;

  for (const byte of bytes) {
    crc = CRC32_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function getExcelColumnName(columnNumber) {
  let number = columnNumber;
  let name = "";

  while (number > 0) {
    const remainder = (number - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    number = Math.floor((number - 1) / 26);
  }

  return name;
}

function triggerDownload(blob, filename) {
  if (window.navigator.msSaveOrOpenBlob) {
    window.navigator.msSaveOrOpenBlob(blob, filename);
    return;
  }

  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function escapeXmlText(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function escapeXmlAttribute(value) {
  return escapeXmlText(value)
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

function isSupportedHttpUrl(value) {
  try {
    const url = new URL(String(value).trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function getSafeImageUrl(value) {
  return isSupportedHttpUrl(value)
    ? value
    : "https://placehold.co/600x400?text=No+Image";
}

function setStatus(message) {
  elements.statusText.textContent = message;
}

function debounce(callback, delay) {
  let timeoutId;
  return (...args) => {
    window.clearTimeout(timeoutId);
    timeoutId = window.setTimeout(() => callback(...args), delay);
  };
}

function escapeHTML(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

fetchSeries();

if (window.location.protocol === "file:") {
  setStatus("Open the frontend from a local server (http://...), not directly as a file.");
}
