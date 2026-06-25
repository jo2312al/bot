const fs = require("fs");
const path = require("path");
const mysql =
  require("./mysqlCliService");

const DATA_DIR =
  path.join(
    __dirname,
    "../data"
  );

const NOTES_FILE =
  path.join(
    DATA_DIR,
    "reservationNotes.json"
  );

const QUOTES_FILE =
  path.join(
    DATA_DIR,
    "quotations.json"
  );

const QUOTATION_MENU_FILE =
  path.join(
    DATA_DIR,
    "quotationMenu.json"
  );

const EVENT_BOOKINGS_FILE =
  path.join(
    DATA_DIR,
    "eventBookings.json"
  );

const EVENT_VOUCHERS_DIR =
  path.join(
    DATA_DIR,
    "event-vouchers"
  );

const EVENT_HALLS =
  [
    {
      code: "MARGARITAS",
      name: "Margaritas"
    },
    {
      code: "TULIPANES",
      name: "Tulipanes"
    },
    {
      code: "GIRASOLES",
      name: "Girasoles"
    }
  ];

const DEFAULT_QUOTATION_MENU =
  [
    {
      title: "Coffee Break",
      price: 180,
      description: "Coffee break por persona"
    },
    {
      title: "Empanadas Margaritas",
      price: 90,
      description: "Orden de 3 empanadas de maiz rellenas de pollo, res o queso con ensalada y salsa"
    },
    {
      title: "Huevos revueltos especiales",
      price: 130,
      description: "Huevos revueltos con chilaquiles verdes o rojos y frijoles refritos"
    },
    {
      title: "Chilaquiles naturales",
      price: 100,
      description: "Chilaquiles verdes o rojos con crema, queso y cebolla"
    },
    {
      title: "Chilaquiles con pollo o huevo",
      price: 130,
      description: "Chilaquiles verdes o rojos con pollo o huevo, crema, queso y cebolla"
    },
    {
      title: "Enchiladas verdes/rojas",
      price: 140,
      description: "Enchiladas de pollo o carne con salsa roja o verde, crema, queso y frijoles"
    },
    {
      title: "Enchiladas de mole",
      price: 140,
      description: "Enchiladas de pollo o carne con mole artesanal tabasqueno, crema y queso"
    },
    {
      title: "Tacos dorados",
      price: 100,
      description: "Orden de 6 tacos dorados de pollo o res con lechuga, queso, crema y salsa"
    },
    {
      title: "Hamburguesa clasica",
      price: 130,
      description: "Hamburguesa clasica del restaurante"
    },
    {
      title: "Hamburguesa hawaiana",
      price: 150,
      description: "Hamburguesa hawaiana del restaurante"
    },
    {
      title: "Hot dog",
      price: 120,
      description: "Hot dog del restaurante"
    },
    {
      title: "Club Sandwich Margaritas",
      price: 150,
      description: "Club sandwich Margaritas"
    },
    {
      title: "Pollo a la parrilla",
      price: 200,
      description: "Pollo a la parrilla con verduras al vapor"
    },
    {
      title: "Fajitas de pollo o res",
      price: 200,
      description: "Fajitas de pollo o res"
    },
    {
      title: "Milanesa de pollo o res",
      price: 200,
      description: "Milanesa de pollo o res"
    },
    {
      title: "Espagueti a la bolonesa",
      price: 130,
      description: "Espagueti a la bolonesa"
    },
    {
      title: "Sandwich de jamon o pollo",
      price: 120,
      description: "Sandwich de jamon o pollo"
    }
  ];

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(
      DATA_DIR,
      {
        recursive: true
      }
    );
  }
}

function readJson(file, fallback) {
  ensureDataDir();

  if (!fs.existsSync(file)) {
    return fallback;
  }

  try {
    return JSON.parse(
      fs.readFileSync(
        file,
        "utf8"
      )
    );
  } catch (error) {
    return fallback;
  }
}

function writeJson(file, payload) {
  ensureDataDir();

  fs.writeFileSync(
    file,
    JSON.stringify(
      payload,
      null,
      2
    ),
    "utf8"
  );
}

function getReservationNoteKey(reservation) {
  return String(
    reservation?.sourceKey
    ||
    (
      reservation?.folio
        ? `folio:${reservation.folio}`
        : ""
    )
  );
}

function readReservationNotes() {
  if (mysql.ensureSchema()) {
    return Object.fromEntries(
      mysql.queryJson(`
        SELECT JSON_OBJECT(
          'reservationKey', reservation_key,
          'note', note,
          'updatedAt', DATE_FORMAT(updated_at, '%Y-%m-%dT%H:%i:%s.000Z')
        )
        FROM reservation_notes;
      `)
        .map(row => [
          row.reservationKey,
          {
            note:
              row.note || "",
            updatedAt:
              row.updatedAt || ""
          }
        ])
    );
  }

  return readJson(
    NOTES_FILE,
    {}
  );
}

function saveReservationNote({
  reservationKey,
  note
}) {
  const key =
    String(reservationKey || "").trim();

  if (!key) {
    throw new Error("Reserva requerida");
  }

  if (mysql.ensureSchema()) {
    mysql.runSql(`
      INSERT INTO reservation_notes (
        reservation_key,
        reservation_id,
        note
      ) VALUES (
        ${mysql.quote(key)},
        (SELECT id FROM reservations WHERE source_key = ${mysql.quote(key)}),
        ${mysql.quote(String(note || "").trim())}
      )
      ON DUPLICATE KEY UPDATE
        reservation_id = VALUES(reservation_id),
        note = VALUES(note);
    `);

    return {
      note:
        String(note || "").trim(),
      updatedAt:
        new Date().toISOString()
    };
  }

  const notes =
    readReservationNotes();

  notes[key] = {
    note:
      String(note || "").trim(),
    updatedAt:
      new Date().toISOString()
  };

  writeJson(
    NOTES_FILE,
    notes
  );

  return notes[key];
}

function readQuotations() {
  if (mysql.ensureSchema()) {
    return mysql.queryJson(`
      SELECT JSON_OBJECT(
        'id', q.id,
        'client', q.client,
        'contact', q.contact,
        'eventName', q.event_name,
        'eventDate', IFNULL(DATE_FORMAT(q.event_date, '%Y-%m-%d'), ''),
        'hallCode', COALESCE(hall.code, ''),
        'hallName', COALESCE(hall.name, ''),
        'template', q.template,
        'headline', q.headline,
        'stayDates', q.stay_dates,
        'people', q.people_count,
        'checkIn', q.check_in_text,
        'checkOut', q.check_out_text,
        'validUntil', q.valid_until,
        'notes', q.notes,
        'serviceChargePercent', q.service_charge_percent,
        'sections', q.sections_json,
        'subtotal', q.subtotal,
        'serviceCharge', q.service_charge,
        'serviceChargeBase', q.service_charge_base,
        'total', q.total,
        'createdAt', DATE_FORMAT(q.created_at, '%Y-%m-%dT%H:%i:%s.000Z'),
        'updatedAt', DATE_FORMAT(q.updated_at, '%Y-%m-%dT%H:%i:%s.000Z')
      )
      FROM quotations q
      LEFT JOIN event_halls hall ON hall.id = q.hall_id
      ORDER BY q.updated_at DESC;
    `);
  }

  return readJson(
    QUOTES_FILE,
    []
  );
}

function normalizeQuotationMenu(items) {
  return (Array.isArray(items) ? items : [])
    .map(item => ({
      title:
        String(item.title || "").trim(),
      price:
        Math.max(
          money(item.price),
          0
        ),
      description:
        String(item.description || "").trim()
    }))
    .filter(item =>
      item.title
    );
}

function readQuotationMenu() {
  if (mysql.ensureSchema()) {
    const rows =
      mysql.queryJson(`
        SELECT JSON_OBJECT(
          'title', title,
          'price', price,
          'description', description
        )
        FROM quotation_menu_items
        WHERE active = 1
        ORDER BY sort_order, title;
      `);

    return rows.length
      ? rows
      : DEFAULT_QUOTATION_MENU;
  }

  const menu =
    normalizeQuotationMenu(
      readJson(
        QUOTATION_MENU_FILE,
        DEFAULT_QUOTATION_MENU
      )
    );

  return menu.length
    ? menu
    : DEFAULT_QUOTATION_MENU;
}

function saveQuotationMenu(items) {
  const menu =
    normalizeQuotationMenu(items);

  if (!menu.length) {
    throw new Error("Agrega al menos un platillo");
  }

  if (mysql.ensureSchema()) {
    mysql.runSql("UPDATE quotation_menu_items SET active = 0;");
    mysql.runSql(`
      INSERT INTO quotation_menu_items (
        title,
        price,
        description,
        sort_order,
        active
      ) VALUES
        ${menu.map((item, index) => `(${mysql.quote(item.title)}, ${Number(item.price)}, ${mysql.quote(item.description)}, ${index}, 1)`).join(",")}
      ON DUPLICATE KEY UPDATE
        price = VALUES(price),
        description = VALUES(description),
        sort_order = VALUES(sort_order),
        active = 1;
    `);
    return menu;
  }

  writeJson(
    QUOTATION_MENU_FILE,
    menu
  );

  return menu;
}

function money(value) {
  return Number(value || 0);
}

function normalizeEventStatus(status) {
  const value =
    String(status || "cotizacion")
      .trim()
      .toLowerCase();

  if (
    [
      "cotizacion",
      "apartado",
      "pago_completo"
    ].includes(value)
  ) {
    return value;
  }

  return "cotizacion";
}

function normalizeHallCode(hallCode) {
  const value =
    String(hallCode || "")
      .trim()
      .toUpperCase();

  return EVENT_HALLS.some(hall =>
    hall.code === value
  )
    ? value
    : "";
}

function sanitizeFileName(name) {
  return String(name || "comprobante")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120) || "comprobante";
}

function roundMoney(value) {
  return Math.round(
    Number(value || 0) * 100
  )
  /
  100;
}

function normalizeQuotation(input) {
  const sections =
    Array.isArray(input.sections)
      ? input.sections
      : [];

  const normalizedSections =
    sections
      .map(section => {
        const quantity =
          Math.max(
            Number(section.quantity || 0),
            0
          );
        const unitPrice =
          Math.max(
            money(section.unitPrice),
            0
          );

        return {
          title:
            String(section.title || "Apartado").trim(),
          category:
            String(section.category || "otro").trim(),
          quantity,
          unitPrice,
          includes:
            String(section.includes || "").trim(),
          subtotal:
            quantity * unitPrice
        };
      })
      .filter(section =>
        section.title
        &&
        section.quantity > 0
      );

  const subtotal =
    roundMoney(
      normalizedSections.reduce(
        (total, section) => total + section.subtotal,
        0
      )
    );

  const serviceChargeBase =
    roundMoney(
      normalizedSections.reduce(
        (total, section) =>
          section.category === "alimentos"
            ? total + section.subtotal
            : total,
        0
      )
    );

  const serviceChargePercent =
    Math.max(
      Number(input.serviceChargePercent || 0),
      0
    );

  const serviceCharge =
    roundMoney(
      serviceChargeBase * serviceChargePercent / 100
    );

  if (!String(input.client || "").trim()) {
    throw new Error("Cliente requerido");
  }

  if (!normalizedSections.length) {
    throw new Error("Agrega al menos un apartado");
  }

  const id =
    input.id
    ||
    `COT-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${Math.random().toString(16).slice(2, 6).toUpperCase()}`;

  return {
    id,
    client:
      String(input.client || "").trim(),
    contact:
      String(input.contact || "").trim(),
    eventName:
      String(input.eventName || "").trim(),
    eventDate:
      String(input.eventDate || "").trim(),
    hallCode:
      normalizeHallCode(input.hallCode),
    template:
      String(input.template || "visual").trim(),
    headline:
      String(input.headline || "").trim(),
    stayDates:
      String(input.stayDates || "").trim(),
    people:
      Math.max(
        Number(input.people || 0),
        0
      ),
    checkIn:
      String(input.checkIn || "3:00 PM").trim(),
    checkOut:
      String(input.checkOut || "12:00 PM").trim(),
    validUntil:
      String(input.validUntil || "").trim(),
    notes:
      String(input.notes || "").trim(),
    serviceChargePercent:
      serviceChargePercent,
    sections:
      normalizedSections,
    subtotal:
      subtotal,
    serviceCharge:
      serviceCharge,
    serviceChargeBase:
      serviceChargeBase,
    total:
      roundMoney(
        subtotal + serviceCharge
      ),
    createdAt:
      input.createdAt || new Date().toISOString(),
    updatedAt:
      new Date().toISOString()
  };
}

function saveQuotation(input) {
  const quotation =
    normalizeQuotation(input);

  if (mysql.ensureSchema()) {
    mysql.runSql(`
      INSERT INTO quotations (
        id,
        client,
        contact,
        event_name,
        event_date,
        hall_id,
        template,
        headline,
        stay_dates,
        people_count,
        check_in_text,
        check_out_text,
        valid_until,
        notes,
        service_charge_percent,
        service_charge_base,
        subtotal,
        service_charge,
        total,
        sections_json,
        created_at,
        updated_at
      ) VALUES (
        ${mysql.quote(quotation.id)},
        ${mysql.quote(quotation.client)},
        ${mysql.quote(quotation.contact)},
        ${mysql.quote(quotation.eventName)},
        ${quotation.eventDate ? mysql.quote(quotation.eventDate) : "NULL"},
        ${quotation.hallCode ? `(SELECT id FROM event_halls WHERE code = ${mysql.quote(quotation.hallCode)})` : "NULL"},
        ${mysql.quote(quotation.template)},
        ${mysql.quote(quotation.headline)},
        ${mysql.quote(quotation.stayDates)},
        ${Number(quotation.people)},
        ${mysql.quote(quotation.checkIn)},
        ${mysql.quote(quotation.checkOut)},
        ${mysql.quote(quotation.validUntil)},
        ${mysql.quote(quotation.notes)},
        ${Number(quotation.serviceChargePercent)},
        ${Number(quotation.serviceChargeBase)},
        ${Number(quotation.subtotal)},
        ${Number(quotation.serviceCharge)},
        ${Number(quotation.total)},
        ${mysql.quote(JSON.stringify(quotation.sections))},
        ${mysql.quote(mysql.timestampToSql(quotation.createdAt) || new Date().toISOString().slice(0, 19).replace("T", " "))},
        ${mysql.quote(mysql.timestampToSql(quotation.updatedAt) || new Date().toISOString().slice(0, 19).replace("T", " "))}
      )
      ON DUPLICATE KEY UPDATE
        client = VALUES(client),
        contact = VALUES(contact),
        event_name = VALUES(event_name),
        event_date = VALUES(event_date),
        hall_id = VALUES(hall_id),
        template = VALUES(template),
        headline = VALUES(headline),
        stay_dates = VALUES(stay_dates),
        people_count = VALUES(people_count),
        check_in_text = VALUES(check_in_text),
        check_out_text = VALUES(check_out_text),
        valid_until = VALUES(valid_until),
        notes = VALUES(notes),
        service_charge_percent = VALUES(service_charge_percent),
        service_charge_base = VALUES(service_charge_base),
        subtotal = VALUES(subtotal),
        service_charge = VALUES(service_charge),
        total = VALUES(total),
        sections_json = VALUES(sections_json),
        updated_at = VALUES(updated_at);
    `);
    return quotation;
  }

  const quotations =
    readQuotations()
      .filter(item =>
        item.id !== quotation.id
      );

  quotations.push(quotation);
  quotations.sort((left, right) =>
    String(right.updatedAt).localeCompare(String(left.updatedAt))
  );

  writeJson(
    QUOTES_FILE,
    quotations
  );

  return quotation;
}

function getQuotation(id) {
  return readQuotations()
    .find(item =>
      item.id === id
    );
}

function readEventBookings() {
  if (mysql.ensureSchema()) {
    return mysql.queryJson(`
      SELECT JSON_OBJECT(
        'id', event.id,
        'quotationId', IFNULL(event.quotation_id, ''),
        'hallCode', hall.code,
        'hallName', hall.name,
        'eventDate', DATE_FORMAT(event.event_date, '%Y-%m-%d'),
        'client', event.client,
        'contact', event.contact,
        'eventName', event.event_name,
        'status', event.status,
        'totalAmount', event.total_amount,
        'paidAmount', event.paid_amount,
        'paymentPercent', LEAST(100, ROUND(event.paid_amount / NULLIF(event.total_amount, 0) * 100, 2)),
        'notes', event.notes,
        'createdAt', DATE_FORMAT(event.created_at, '%Y-%m-%dT%H:%i:%s.000Z'),
        'updatedAt', DATE_FORMAT(event.updated_at, '%Y-%m-%dT%H:%i:%s.000Z'),
        'vouchers', COALESCE(
          (
            SELECT JSON_ARRAYAGG(
              JSON_OBJECT(
                'id', voucher.id,
                'fileName', voucher.file_name,
                'mimeType', voucher.mime_type,
                'url', CONCAT('/api/events/vouchers/', voucher.id),
                'amount', voucher.amount,
                'notes', voucher.notes,
                'uploadedAt', DATE_FORMAT(voucher.uploaded_at, '%Y-%m-%dT%H:%i:%s.000Z')
              )
            )
            FROM event_payment_vouchers voucher
            WHERE voucher.quote_event_id = event.id
          ),
          JSON_ARRAY()
        )
      )
      FROM quote_events event
      JOIN event_halls hall ON hall.id = event.hall_id
      ORDER BY event.event_date DESC, hall.sort_order, event.updated_at DESC;
    `)
      .map(event => ({
        ...event,
        paymentPercent:
          Number(event.paymentPercent || 0)
      }));
  }

  return readJson(
    EVENT_BOOKINGS_FILE,
    []
  );
}

function saveEventBooking(input) {
  const hallCode =
    normalizeHallCode(input.hallCode);
  const eventDate =
    String(input.eventDate || "").trim();

  if (!hallCode) {
    throw new Error("Selecciona un salon");
  }

  if (!eventDate) {
    throw new Error("Selecciona la fecha del evento");
  }

  const quotation =
    input.quotationId
      ? getQuotation(String(input.quotationId))
      : null;

  const totalAmount =
    Math.max(
      money(input.totalAmount ?? quotation?.total),
      0
    );
  const paidAmount =
    Math.max(
      money(input.paidAmount),
      0
    );

  const booking = {
    id:
      input.id || `EV-${Date.now()}-${Math.random().toString(16).slice(2, 6).toUpperCase()}`,
    quotationId:
      quotation?.id || String(input.quotationId || "").trim(),
    hallCode,
    hallName:
      EVENT_HALLS.find(hall => hall.code === hallCode)?.name || hallCode,
    eventDate,
    client:
      String(input.client || quotation?.client || "").trim(),
    contact:
      String(input.contact || quotation?.contact || "").trim(),
    eventName:
      String(input.eventName || quotation?.eventName || quotation?.headline || "").trim(),
    status:
      normalizeEventStatus(input.status),
    totalAmount,
    paidAmount,
    notes:
      String(input.notes || "").trim(),
    createdAt:
      input.createdAt || new Date().toISOString(),
    updatedAt:
      new Date().toISOString(),
    vouchers:
      Array.isArray(input.vouchers) ? input.vouchers : []
  };

  if (mysql.ensureSchema()) {
    const idSql =
      /^\d+$/.test(String(input.id || ""))
        ? Number(input.id)
        : "NULL";

    mysql.runSql(`
      INSERT INTO quote_events (
        id,
        quotation_id,
        hall_id,
        event_date,
        client,
        contact,
        event_name,
        status,
        total_amount,
        paid_amount,
        notes,
        created_at,
        updated_at
      ) VALUES (
        ${idSql},
        ${booking.quotationId ? mysql.quote(booking.quotationId) : "NULL"},
        (SELECT id FROM event_halls WHERE code = ${mysql.quote(booking.hallCode)}),
        ${mysql.quote(booking.eventDate)},
        ${mysql.quote(booking.client)},
        ${mysql.quote(booking.contact)},
        ${mysql.quote(booking.eventName)},
        ${mysql.quote(booking.status)},
        ${Number(booking.totalAmount)},
        ${Number(booking.paidAmount)},
        ${mysql.quote(booking.notes)},
        ${mysql.quote(mysql.timestampToSql(booking.createdAt) || new Date().toISOString().slice(0, 19).replace("T", " "))},
        ${mysql.quote(mysql.timestampToSql(booking.updatedAt) || new Date().toISOString().slice(0, 19).replace("T", " "))}
      )
      ON DUPLICATE KEY UPDATE
        quotation_id = VALUES(quotation_id),
        hall_id = VALUES(hall_id),
        event_date = VALUES(event_date),
        client = VALUES(client),
        contact = VALUES(contact),
        event_name = VALUES(event_name),
        status = VALUES(status),
        total_amount = VALUES(total_amount),
        paid_amount = VALUES(paid_amount),
        notes = VALUES(notes),
        updated_at = VALUES(updated_at);
    `);

    const rows =
      mysql.queryJson(`
        SELECT JSON_OBJECT(
          'id', id
        )
        FROM quote_events
        WHERE hall_id = (SELECT id FROM event_halls WHERE code = ${mysql.quote(booking.hallCode)})
          AND event_date = ${mysql.quote(booking.eventDate)}
          AND client = ${mysql.quote(booking.client)}
          AND event_name = ${mysql.quote(booking.eventName)}
        ORDER BY updated_at DESC, id DESC
        LIMIT 1;
      `);

    return {
      ...booking,
      id:
        rows[0]?.id || input.id
    };
  }

  const bookings =
    readEventBookings()
      .filter(item =>
        String(item.id) !== String(booking.id)
      );

  bookings.push(booking);
  writeJson(
    EVENT_BOOKINGS_FILE,
    bookings
  );

  return booking;
}

function saveEventVoucher(input) {
  const eventId =
    Number(input.eventId || 0);
  const dataUrl =
    String(input.dataUrl || "");
  const match =
    dataUrl.match(/^data:([^;]+);base64,(.+)$/);

  if (!eventId) {
    throw new Error("Evento requerido");
  }

  if (!match) {
    throw new Error("Comprobante invalido");
  }

  const mimeType =
    match[1];
  const extension =
    mimeType.includes("png")
      ? ".png"
      : mimeType.includes("webp")
        ? ".webp"
        : ".jpg";
  const fileName =
    `${Date.now()}-${sanitizeFileName(input.fileName)}${path.extname(input.fileName || "") ? "" : extension}`;

  ensureDataDir();
  fs.mkdirSync(
    EVENT_VOUCHERS_DIR,
    {
      recursive: true
    }
  );

  const filePath =
    path.join(
      EVENT_VOUCHERS_DIR,
      fileName
    );

  fs.writeFileSync(
    filePath,
    Buffer.from(
      match[2],
      "base64"
    )
  );

  if (!mysql.ensureSchema()) {
    throw new Error("Los comprobantes requieren MySQL activo");
  }

  const uploadedAt =
    new Date().toISOString();

  mysql.runSql(`
    INSERT INTO event_payment_vouchers (
      quote_event_id,
      file_name,
      mime_type,
      file_path,
      amount,
      notes,
      uploaded_at
    ) VALUES (
      ${eventId},
      ${mysql.quote(fileName)},
      ${mysql.quote(mimeType)},
      ${mysql.quote(filePath)},
      ${Number(money(input.amount))},
      ${mysql.quote(String(input.notes || "").trim())},
      ${mysql.quote(mysql.timestampToSql(uploadedAt))}
    );
  `);

  const rows =
    mysql.queryJson(`
      SELECT JSON_OBJECT(
        'id', id,
        'fileName', file_name,
        'mimeType', mime_type,
        'url', CONCAT('/api/events/vouchers/', id),
        'amount', amount,
        'notes', notes,
        'uploadedAt', DATE_FORMAT(uploaded_at, '%Y-%m-%dT%H:%i:%s.000Z')
      )
      FROM event_payment_vouchers
      WHERE quote_event_id = ${eventId}
      ORDER BY id DESC
      LIMIT 1;
    `);

  return rows[0];
}

function getEventVoucher(id) {
  if (!mysql.ensureSchema()) {
    return null;
  }

  return mysql.queryJson(`
    SELECT JSON_OBJECT(
      'id', id,
      'fileName', file_name,
      'mimeType', mime_type,
      'filePath', file_path
    )
    FROM event_payment_vouchers
    WHERE id = ${Number(id || 0)}
    LIMIT 1;
  `)[0] || null;
}

module.exports = {
  EVENT_HALLS,
  getQuotation,
  getEventVoucher,
  getReservationNoteKey,
  readEventBookings,
  readQuotationMenu,
  readQuotations,
  readReservationNotes,
  saveEventBooking,
  saveEventVoucher,
  saveQuotationMenu,
  saveQuotation,
  saveReservationNote
};
