const API_BASE_URL = "http://localhost:8080";

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
elements.exportButton.addEventListener("click", exportCSV);
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
  if (seriesList.length === 0) {
    elements.seriesGrid.innerHTML = `
      <div class="empty-state">
        <h3>No series found</h3>
        <p>Try adjusting the search or add a new series from the form.</p>
      </div>
    `;
    return;
  }

  elements.seriesGrid.innerHTML = seriesList.map((item) => `
    <article class="series-card">
      <img src="${escapeHTML(item.image)}" alt="${escapeHTML(item.title)}" onerror="this.src='https://placehold.co/600x400?text=No+Image';" />
      <div class="card-content">
        <div class="card-meta">${item.episodes} episodes</div>
        <h3>${escapeHTML(item.title)}</h3>
        <p>${escapeHTML(item.description)}</p>
        <div class="card-actions">
          <button class="primary-button" type="button" onclick="startEdit(${item.id})">Edit</button>
          <button class="secondary-button" type="button" onclick="removeSeries(${item.id})">Delete</button>
        </div>
      </div>
    </article>
  `).join("");
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

function resetForm() {
  state.editingId = null;
  elements.form.reset();
  elements.seriesId.value = "";
  elements.formTitle.textContent = "Add New Series";
  elements.formSubtitle.textContent = "Fill in all fields to create a new record.";
  elements.cancelEditButton.classList.add("hidden");
}

function exportCSV() {
  if (state.data.length === 0) {
    setStatus("There is no data to export on the current page.");
    return;
  }

  const headers = ["id", "title", "description", "episodes", "image"];
  const rows = state.data.map((item) => [
    item.id,
    item.title,
    item.description,
    item.episodes,
    item.image,
  ]);

  const csvContent = [headers, ...rows]
    .map((row) => row.map(csvEscape).join(","))
    .join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "series.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  setStatus("CSV exported successfully.");
}

function csvEscape(value) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
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
