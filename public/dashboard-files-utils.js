// Dashboard frontend module: files-utils
function isIsoWithinSelection(isoDate) {
  const start = closeStart.value;
  const end = closeEnd.value || start;

  if (!start) {
    return false;
  }

  return isoDate >= start && isoDate <= end;
}

function updateSelectionSummary() {
  const start = closeStart.value;
  const end = closeEnd.value || start;

  if (!start) {
    selectionSummary.textContent = 'Selecciona una fecha en el calendario.';
    return;
  }

  selectionSummary.textContent = start === end
    ? 'Seleccionado: ' + isoToDisplay(start)
    : 'Rango seleccionado: ' + isoToDisplay(start) + ' al ' + isoToDisplay(end);
}

async function analyzeRack() {
  const file = rackImage.files[0];

  if (!file) {
    alert('Selecciona una foto del rack.');
    return;
  }

  rackResult.value = 'Leyendo rack... puede tardar hasta 90 segundos.';
  analyzeRackButton.disabled = true;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90000);

  try {
    const dataUrl = await fileToCompressedDataUrl(file);
    const imageBase64 = dataUrl.split(',')[1];

    const response = await fetch('/api/rack/analyze', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      signal: controller.signal,
      body: JSON.stringify({
        imageBase64,
        mimeType: 'image/jpeg'
      })
    });

    const data = await response.json();

    rackResult.value = data.ok
      ? data.message + (data.ocrPreview ? '\\n\\n--- OCR detectado ---\\n' + data.ocrPreview : '')
      : data.error || 'No se pudo analizar el rack.';
  } catch (error) {
    rackResult.value = error.name === 'AbortError'
      ? 'La lectura tardo demasiado. Intenta con una foto mas derecha, bien iluminada y tomada de frente.'
      : 'No se pudo analizar el rack: ' + (error.message || 'error desconocido');
  } finally {
    clearTimeout(timeout);
    analyzeRackButton.disabled = false;
  }
}

async function analyzeRackCsvFile() {
  const file = rackCsv.files[0];

  if (!file) {
    alert('Selecciona el CSV exportado del rack.');
    return;
  }

  rackResult.value = 'Leyendo CSV del rack...';
  analyzeRackCsvButton.disabled = true;

  try {
    const csvText = await file.text();

    const response = await fetch('/api/rack/analyze-csv', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        csvText,
        fileName: file.name
      })
    });

    const data = await response.json();

    rackResult.value = data.ok
      ? data.message + (data.saved ? '\\n\\nGuardado como ultimo rack.' : '\\n\\nNo se guardo porque ya existe un rack mas reciente.')
      : data.error || 'No se pudo analizar el CSV.';

    if (data.ok) {
      await loadDashboard();
    }
  } catch (error) {
    rackResult.value = 'No se pudo analizar el CSV: ' + (error.message || 'error desconocido');
  } finally {
    analyzeRackCsvButton.disabled = false;
  }
}

let activeFileInputId = '';

function setupFileDropzones() {
  document.querySelectorAll('[data-file-zone]').forEach(zone => {
    const input = document.getElementById(zone.dataset.fileZone);

    if (!input) {
      return;
    }

    zone.addEventListener('focusin', () => setActiveFileZone(zone));
    zone.addEventListener('mouseenter', () => setActiveFileZone(zone));
    zone.addEventListener('click', () => setActiveFileZone(zone));
    zone.addEventListener('keydown', event => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        input.click();
      }
    });

    input.addEventListener('change', () => updateFileZone(input));

    ['dragenter', 'dragover'].forEach(type => {
      zone.addEventListener(type, event => {
        event.preventDefault();
        setActiveFileZone(zone);
        zone.classList.add('dragging');
      });
    });

    ['dragleave', 'drop'].forEach(type => {
      zone.addEventListener(type, () => {
        zone.classList.remove('dragging');
      });
    });

    zone.addEventListener('drop', event => {
      event.preventDefault();
      setFileInputFiles(input, event.dataTransfer.files);
    });
  });

  document.addEventListener('paste', event => {
    const files = Array.from(event.clipboardData?.files || []);

    if (!files.length) {
      return;
    }

    const zone = findPasteTarget(files);

    if (!zone) {
      return;
    }

    const input = document.getElementById(zone.dataset.fileZone);

    if (input && setFileInputFiles(input, files)) {
      event.preventDefault();
      setActiveFileZone(zone);
    }
  });
}

function setActiveFileZone(zone) {
  activeFileInputId = zone.dataset.fileZone || activeFileInputId;
  document.querySelectorAll('[data-file-zone]').forEach(item => {
    item.classList.toggle('active', item === zone);
  });
}

function findPasteTarget(files) {
  const zones = Array.from(document.querySelectorAll('[data-file-zone]'));
  const activeZone = zones.find(zone => zone.dataset.fileZone === activeFileInputId);

  if (activeZone && files.some(file => fileMatchesInput(file, document.getElementById(activeZone.dataset.fileZone)))) {
    return activeZone;
  }

  return zones.find(zone => {
    const input = document.getElementById(zone.dataset.fileZone);
    const isVisible = zone.offsetParent !== null;
    return isVisible && files.some(file => fileMatchesInput(file, input));
  });
}

function setFileInputFiles(input, files) {
  const compatible = Array.from(files || [])
    .filter(file => fileMatchesInput(file, input));

  if (!compatible.length) {
    return false;
  }

  const transfer = new DataTransfer();
  transfer.items.add(compatible[0]);
  input.files = transfer.files;
  updateFileZone(input);
  return true;
}

function fileMatchesInput(file, input) {
  if (!file || !input) {
    return false;
  }

  const accept = String(input.getAttribute('accept') || '').split(',').map(item => item.trim()).filter(Boolean);

  if (!accept.length) {
    return true;
  }

  const name = String(file.name || '').toLowerCase();
  const type = String(file.type || '').toLowerCase();

  return accept.some(rule => {
    const normalized = rule.toLowerCase();

    if (normalized.endsWith('/*')) {
      return type.startsWith(normalized.slice(0, -1));
    }

    if (normalized.startsWith('.')) {
      return name.endsWith(normalized);
    }

    return type === normalized || (normalized === 'text/csv' && name.endsWith('.csv'));
  });
}

function updateFileZone(input) {
  const label = document.getElementById(input.id + 'Name');
  const file = input.files?.[0];

  if (!label) {
    return;
  }

  label.textContent = file ? file.name : label.id === 'rackImageName'
    ? 'Arrastra, pega o elige imagen'
    : 'Arrastra, pega o elige archivo';
}

function fileToCompressedDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const maxSide = 1800;
        const ratio = Math.min(1, maxSide / Math.max(image.width, image.height));
        const width = Math.max(1, Math.round(image.width * ratio));
        const height = Math.max(1, Math.round(image.height * ratio));
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        context.drawImage(image, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', 0.86));
      };
      image.onerror = reject;
      image.src = reader.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function isoToDate(value) {
  const parts = value.split('-').map(Number);
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

function isoToDisplay(value) {
  if (!/^\d{4}-\d{2}-\d{2}/.test(String(value || ''))) {
    return '';
  }
  return dateToDisplay(isoToDate(value));
}

function dateToIso(date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return date.getFullYear() + '-' + month + '-' + day;
}

function dateToDisplay(date) {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return day + '/' + month + '/' + date.getFullYear();
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeJs(value) {
  return JSON.stringify(String(value))
    .slice(1, -1)
    .split("'")
    .join("\\\'");
}

function escapeJsArg(value) {
  return "'" + escapeJs(value || '') + "'";
}

setupFileDropzones();
loadBotStatus();
loadDashboard();
setInterval(loadBotStatus, 5000);
document.addEventListener('click', event => {
  const searchPanel = document.querySelector('.global-search-panel');

  if (
    searchPanel &&
    !searchPanel.contains(event.target) &&
    !globalSearchResults.classList.contains('hidden')
  ) {
    closeGlobalSearchResults();
  }
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    if (!globalSearchResults.classList.contains('hidden')) {
      closeGlobalSearchResults();
    } else if (!confirmRackBackdrop.classList.contains('hidden')) {
      closeRackConfirm();
    } else if (!searchDetailModalBackdrop.classList.contains('hidden')) {
      closeSearchDetailModal();
    } else if (!eventDetailModalBackdrop.classList.contains('hidden')) {
      closeEventDetailModal();
    } else if (!quoteEventModalBackdrop.classList.contains('hidden')) {
      closeQuoteEventModal();
    } else if (!quoteMenuModalBackdrop.classList.contains('hidden')) {
      closeQuoteMenuModal();
    } else if (!groupSendConfirmBackdrop.classList.contains('hidden')) {
      closeGroupSendConfirm();
    } else if (!reservationArrivalBackdrop.classList.contains('hidden')) {
      closeReservationArrival();
    } else if (!preassignModalBackdrop.classList.contains('hidden')) {
      closePreassignModal();
    } else if (!confirmDeleteBackdrop.classList.contains('hidden')) {
      closeDeleteConfirm();
    } else {
      closeDayModal();
    }
  }
});
