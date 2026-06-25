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
        'id', id,
        'client', client,
        'contact', contact,
        'eventName', event_name,
        'template', template,
        'headline', headline,
        'stayDates', stay_dates,
        'people', people_count,
        'checkIn', check_in_text,
        'checkOut', check_out_text,
        'validUntil', valid_until,
        'notes', notes,
        'serviceChargePercent', service_charge_percent,
        'sections', sections_json,
        'subtotal', subtotal,
        'serviceCharge', service_charge,
        'serviceChargeBase', service_charge_base,
        'total', total,
        'createdAt', DATE_FORMAT(created_at, '%Y-%m-%dT%H:%i:%s.000Z'),
        'updatedAt', DATE_FORMAT(updated_at, '%Y-%m-%dT%H:%i:%s.000Z')
      )
      FROM quotations
      ORDER BY updated_at DESC;
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

module.exports = {
  getQuotation,
  getReservationNoteKey,
  readQuotationMenu,
  readQuotations,
  readReservationNotes,
  saveQuotationMenu,
  saveQuotation,
  saveReservationNote
};
