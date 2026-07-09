// Dashboard frontend module: quotes
function renderQuoteSections() {
  quoteSections.innerHTML = quoteSectionsData.map((section, index) =>
    '<div class="quote-section">' +
      '<label>Titulo<input value="' + escapeHtml(section.title || '') + '" oninput="updateQuoteSection(' + index + ', \'title\', this.value)"></label>' +
      '<label>Tipo<select onchange="updateQuoteSection(' + index + ', \'category\', this.value)">' +
        '<option value="habitaciones"' + (section.category === 'habitaciones' ? ' selected' : '') + '>Habitaciones</option>' +
        '<option value="salon"' + (section.category === 'salon' ? ' selected' : '') + '>Salon</option>' +
        '<option value="alimentos"' + (section.category === 'alimentos' ? ' selected' : '') + '>Alimentos/Menu</option>' +
        '<option value="otro"' + (section.category === 'otro' ? ' selected' : '') + '>Otro</option>' +
      '</select></label>' +
      '<label>' + escapeHtml(getQuoteQuantityLabel(section.category)) + '<input type="number" min="0" value="' + escapeHtml(section.quantity || 0) + '" oninput="updateQuoteSection(' + index + ', \'quantity\', this.value)"></label>' +
      '<label>' + escapeHtml(getQuotePriceLabel(section.category)) + '<input type="number" min="0" value="' + escapeHtml(section.unitPrice || 0) + '" oninput="updateQuoteSection(' + index + ', \'unitPrice\', this.value)"></label>' +
      '<button class="danger" onclick="removeQuoteSection(' + index + ')">Quitar</button>' +
      '<textarea placeholder="Que incluye este apartado" oninput="updateQuoteSection(' + index + ', \'includes\', this.value)">' + escapeHtml(section.includes || '') + '</textarea>' +
    '</div>'
  ).join('');
  renderQuoteTotals();
}

function getQuoteQuantityLabel(category) {
  if (category === 'habitaciones') {
    return 'Habitaciones';
  }

  if (category === 'alimentos') {
    return 'Personas';
  }

  return 'Cantidad';
}

function getQuotePriceLabel(category) {
  if (category === 'habitaciones') {
    return 'Precio por habitacion';
  }

  if (category === 'alimentos') {
    return 'Precio por persona';
  }

  return 'Precio unitario';
}

function renderQuoteMenuOptions() {
  if (!quoteMenuSelect) {
    return;
  }

  const previousValue = quoteMenuSelect.value;
  quoteMenuSelect.innerHTML = quoteMenuItems.map((item, index) =>
    '<option value="' + index + '">' + escapeHtml(item.title) + ' - ' + formatMoney(item.price) + ' p/p</option>'
  ).join('');
  if (previousValue && quoteMenuSelect.options[Number(previousValue)]) {
    quoteMenuSelect.value = previousValue;
  }
  renderQuoteMenuPreview();
}

function renderQuoteMenuEditor() {
  if (!quoteMenuEditor) {
    return;
  }

  quoteMenuEditor.innerHTML = quoteMenuItems.map((item, index) =>
    '<div class="quote-menu-row">' +
      '<input value="' + escapeHtml(item.title || '') + '" placeholder="Platillo" oninput="updateQuoteMenuItem(' + index + ', \'title\', this.value)">' +
      '<input type="number" min="0" value="' + escapeHtml(item.price || 0) + '" oninput="updateQuoteMenuItem(' + index + ', \'price\', this.value)">' +
      '<input value="' + escapeHtml(item.description || '') + '" placeholder="Descripcion" oninput="updateQuoteMenuItem(' + index + ', \'description\', this.value)">' +
      '<button class="danger compact" onclick="removeQuoteMenuItem(' + index + ')">Quitar</button>' +
    '</div>'
  ).join('');
}

function updateQuoteMenuItem(index, field, value) {
  quoteMenuItems[index][field] = field === 'price'
    ? Number(value || 0)
    : value;
  renderQuoteMenuOptions();
}

function addQuoteMenuEditorRow() {
  quoteMenuItems.push({
    title: 'Nuevo platillo',
    price: 0,
    description: ''
  });
  renderQuoteMenuEditor();
  renderQuoteMenuOptions();
}

function removeQuoteMenuItem(index) {
  quoteMenuItems.splice(index, 1);

  if (!quoteMenuItems.length) {
    addQuoteMenuEditorRow();
    return;
  }

  renderQuoteMenuEditor();
  renderQuoteMenuOptions();
}

async function saveQuoteMenuCatalog() {
  quoteMenuStatus.textContent = 'Guardando catalogo...';
  const response = await fetch('/api/quotation-menu', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      items: quoteMenuItems
    })
  });
  const data = await response.json();

  if (!data.ok) {
    quoteMenuStatus.textContent = data.error || 'No se pudo guardar el catalogo.';
    return;
  }

  quoteMenuItems = data.menu;
  quoteMenuStatus.textContent = 'Catalogo guardado.';
  renderQuoteMenuEditor();
  renderQuoteMenuOptions();
}

function openQuoteMenuModal() {
  renderQuoteMenuEditor();
  quoteMenuModalBackdrop.classList.remove('hidden');
  document.body.classList.add('app-modal-open');
}

function closeQuoteMenuModal() {
  quoteMenuModalBackdrop.classList.add('hidden');

  if (
    dayModalBackdrop.classList.contains('hidden') &&
    confirmDeleteBackdrop.classList.contains('hidden') &&
    confirmRackBackdrop.classList.contains('hidden')
  ) {
    document.body.classList.remove('app-modal-open');
  }
}

function getMenuModifierPrice() {
  return (quoteAddWater?.checked ? 30 : 0) + (quoteAddCoffee?.checked ? 30 : 0);
}

function getMenuModifierText() {
  const modifiers = [];

  if (quoteAddWater?.checked) {
    modifiers.push('Agua +$30');
  }

  if (quoteAddCoffee?.checked) {
    modifiers.push('Cafe +$30');
  }

  return modifiers;
}

function renderQuoteMenuPreview() {
  if (!quoteMenuSelect || !quoteMenuPreview) {
    return;
  }

  const item = quoteMenuItems[Number(quoteMenuSelect.value || 0)];
  const totalPrice = item ? item.price + getMenuModifierPrice() : 0;
  const modifiers = getMenuModifierText();

  quoteMenuPreview.textContent = item
    ? item.description + (modifiers.length ? ' / ' + modifiers.join(' / ') : '') + ' / ' + formatMoney(totalPrice) + ' por persona'
    : '';
}

function addSelectedMenuItem() {
  const item = quoteMenuItems[Number(quoteMenuSelect.value || 0)];

  if (!item) {
    return;
  }

  const modifiers = getMenuModifierText();

  quoteSectionsData.push({
    title: item.title,
    category: 'alimentos',
    quantity: Number(quotePeople.value || 1),
    unitPrice: item.price + getMenuModifierPrice(),
    includes: item.description + (modifiers.length ? '\\n' + modifiers.join('\\n') : '')
  });
  renderQuoteSections();
}

function addQuoteSection() {
  quoteSectionsData.push({
    title: 'Nuevo apartado',
    category: 'otro',
    quantity: 1,
    unitPrice: 0,
    includes: ''
  });
  renderQuoteSections();
}

function addQuotePreset(type) {
  const presets = {
    habitaciones: {
      title: 'Habitacion doble',
      category: 'habitaciones',
      quantity: Number(quotePeople.value || 1),
      unitPrice: 700,
      includes: 'Habitacion\\nIVA incluido\\nRecepcion 24 horas\\nEstacionamiento\\nInternet'
    },
    salon: {
      title: 'Salon para evento',
      category: 'salon',
      quantity: 1,
      unitPrice: 0,
      includes: 'Uso de salon\\nMontaje basico\\nMesas y sillas'
    },
    alimentos: {
      title: 'Coffee Break',
      category: 'alimentos',
      quantity: Number(quotePeople.value || 1),
      unitPrice: 180,
      includes: 'Coffee break por persona'
    }
  };

  quoteSectionsData.push(presets[type] || {
    title: 'Nuevo apartado',
    category: 'otro',
    quantity: 1,
    unitPrice: 0,
    includes: ''
  });
  renderQuoteSections();
}

function removeQuoteSection(index) {
  quoteSectionsData.splice(index, 1);

  if (!quoteSectionsData.length) {
    addQuoteSection();
    return;
  }

  renderQuoteSections();
}

function updateQuoteSection(index, field, value) {
  quoteSectionsData[index][field] =
    field === 'quantity' || field === 'unitPrice'
      ? Number(value || 0)
      : value;
  renderQuoteTotals();
}

function getQuoteSubtotal() {
  return quoteSectionsData.reduce((total, section) =>
    total + Number(section.quantity || 0) * Number(section.unitPrice || 0),
    0
  );
}

function getQuoteFoodSubtotal() {
  return quoteSectionsData.reduce((total, section) =>
    section.category === 'alimentos'
      ? total + Number(section.quantity || 0) * Number(section.unitPrice || 0)
      : total,
    0
  );
}

function getQuoteServiceCharge() {
  return getQuoteFoodSubtotal() * Number(quoteServiceCharge?.value || 0) / 100;
}

function getQuoteTotal() {
  return getQuoteSubtotal() + getQuoteServiceCharge();
}

function renderQuoteTotals() {
  const subtotal = getQuoteSubtotal();
  const foodSubtotal = getQuoteFoodSubtotal();
  const service = getQuoteServiceCharge();
  quoteSubtotalLine.innerHTML = '<span>Subtotal</span><strong>' + formatMoney(subtotal) + '</strong>';
  quoteServiceLine.innerHTML = '<span>Servicio ' + Number(quoteServiceCharge?.value || 0) + '% alimentos <small>(' + formatMoney(foodSubtotal) + ')</small></span><strong>' + formatMoney(service) + '</strong>';
  quoteTotal.textContent = formatMoney(subtotal + service);
}

function renderHallSelects() {
  const options = eventHalls.map(hall =>
    '<option value="' + escapeHtml(hall.code) + '">' + escapeHtml(hall.name) + '</option>'
  ).join('');

  if (quoteHall && quoteHall.options.length <= 1) {
    quoteHall.innerHTML = '<option value="">Sin salon</option>' + options;
  }

  if (eventHall && !eventHall.options.length) {
    eventHall.innerHTML = options;
  }

  if (quoteEventModalHall && !quoteEventModalHall.options.length) {
    quoteEventModalHall.innerHTML = options;
  }

  if (eventMonth && !eventMonth.value) {
    eventMonth.value = new Date().toISOString().slice(0, 7);
  }
}


function renderQuotationList(rows) {
  if (!rows.length) {
    quoteList.innerHTML = '<div class="muted">Sin cotizaciones guardadas.</div>';
    return;
  }

  quoteList.innerHTML = rows.slice(0, 8).map(row =>
    '<div class="quote-item">' +
      '<strong>' + escapeHtml(row.id) + '</strong>' +
      '<div>' + escapeHtml(row.client || '') + '</div>' +
      '<div class="muted">' + escapeHtml(row.headline || row.eventName || 'Sin evento') + ' / ' + formatMoney(row.total || 0) + '</div>' +
      '<div class="muted">' + escapeHtml(row.eventDate || 'Sin fecha') + ' · ' + escapeHtml(row.hallName || row.hallCode || 'Sin salon') + '</div>' +
      '<div class="muted">Formato: ' + escapeHtml(row.template === 'formal' ? 'Formal' : 'Visual hotel') + '</div>' +
      '<div class="summary-chips">' +
        '<button class="compact" onclick="window.open(\'/api/quotations/' + encodeURIComponent(row.id) + '/print\', \'_blank\')">Abrir PDF</button>' +
        '<button class="compact" onclick="createEventFromQuotation(\'' + escapeHtml(row.id) + '\')">Apartar salon</button>' +
      '</div>' +
    '</div>'
  ).join('');
}

async function saveQuotation() {
  const payload = {
    client: quoteClient.value.trim(),
    contact: quoteContact.value.trim(),
    eventName: quoteEventName.value.trim(),
    eventDate: quoteEventDate.value,
    hallCode: quoteHall.value,
    template: document.querySelector('input[name="quoteTemplate"]:checked')?.value || 'visual',
    headline: quoteHeadline.value.trim(),
    stayDates: quoteStayDates.value.trim(),
    people: Number(quotePeople.value || 0),
    checkIn: quoteCheckIn.value.trim(),
    checkOut: quoteCheckOut.value.trim(),
    validUntil: quoteValidUntil.value,
    notes: quoteNotes.value.trim(),
    serviceChargePercent: Number(quoteServiceCharge.value || 0),
    sections: quoteSectionsData
  };

  if (!payload.client) {
    alert('Escribe el cliente de la cotizacion.');
    return;
  }

  quoteStatus.textContent = 'Guardando cotizacion...';
  const response = await fetch('/api/quotations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  const data = await response.json();

  if (!data.ok) {
    quoteStatus.textContent = data.error || 'No se pudo guardar.';
    return;
  }

  quoteStatus.innerHTML =
    'Guardada: ' + escapeHtml(data.quotation.id) +
    ' <button class="compact" onclick="window.open(\'/api/quotations/' + encodeURIComponent(data.quotation.id) + '/print\', \'_blank\')">Abrir PDF</button>';
  quoteClient.value = '';
  quoteContact.value = '';
  quoteEventName.value = '';
  quoteEventDate.value = '';
  quoteHall.value = '';
  quoteHeadline.value = '';
  quoteStayDates.value = '';
  quotePeople.value = '';
  quoteCheckIn.value = '';
  quoteCheckOut.value = '';
  quoteServiceCharge.value = '0';
  quoteValidUntil.value = '';
  quoteNotes.value = '';
  document.querySelector('input[name="quoteTemplate"][value="visual"]').checked = true;
  quoteSectionsData = [
    {
      title: 'Hospedaje',
      category: 'habitaciones',
      quantity: 1,
      unitPrice: 700,
      includes: 'Recepcion 24 horas\\nEstacionamiento\\nInternet\\nTelevision por cable\\nAgua fria y caliente'
    }
  ];
  await loadDashboard();
  showView('quotes');
}

