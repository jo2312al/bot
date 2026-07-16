const ROLES = [
  ["admin", "Administrador", "Configuracion, seguridad y autorizaciones excepcionales"],
  ["management", "Gerencia", "Supervision, autorizaciones y cierre"],
  ["night_auditor", "Auditor nocturno", "Auditoria y cierre del dia operativo"],
  ["front_desk", "Recepcion", "Reservas, estancias y operacion de recepcion"],
  ["cashier", "Caja", "Cobros, caja y conciliacion"],
  ["sales", "Ventas", "Clientes, cotizaciones, reservas y anticipos"],
  ["accounting", "Contabilidad", "Finanzas, cobranza y facturacion"],
  ["viewer", "Consulta", "Acceso de solo lectura configurado" ]
];

const PERMISSIONS = [
  ["users.view", "users", "Consultar usuarios"],
  ["users.create", "users", "Crear usuarios"],
  ["users.update", "users", "Modificar usuarios"],
  ["users.disable", "users", "Deshabilitar usuarios"],
  ["roles.manage", "users", "Administrar roles y permisos"],
  ["reservations.view", "reservations", "Consultar reservas"],
  ["reservations.create", "reservations", "Crear reservas"],
  ["reservations.update", "reservations", "Modificar reservas"],
  ["reservations.cancel", "reservations", "Cancelar reservas"],
  ["stays.view", "stays", "Consultar estancias"],
  ["stays.checkin", "stays", "Registrar check-in"],
  ["stays.update", "stays", "Modificar estancia"],
  ["stays.move_room", "stays", "Cambiar habitacion"],
  ["stays.checkout", "stays", "Registrar check-out"],
  ["rack.view", "rack", "Consultar rack"],
  ["rack.update_manual_state", "rack", "Modificar estado manual permitido"],
  ["rack.block", "rack", "Bloquear habitacion"],
  ["rack.unblock", "rack", "Desbloquear habitacion"],
  ["ledger.view", "ledger", "Consultar cuenta"],
  ["ledger.charge", "ledger", "Registrar cargo"],
  ["ledger.payment", "ledger", "Registrar pago"],
  ["ledger.transfer", "ledger", "Transferir movimientos"],
  ["ledger.adjust", "ledger", "Solicitar ajuste"],
  ["ledger.authorize_discount", "ledger", "Autorizar descuento"],
  ["ledger.authorize_refund", "ledger", "Autorizar reembolso"],
  ["ledger.authorize_credit", "ledger", "Autorizar credito"],
  ["cash.open", "cash", "Abrir caja"],
  ["cash.view_own", "cash", "Consultar caja propia"],
  ["cash.view_all", "cash", "Consultar todas las cajas"],
  ["cash.close", "cash", "Cerrar caja"],
  ["cash.reconcile", "cash", "Conciliar caja"],
  ["business_day.view", "business_day", "Consultar dia operativo"],
  ["business_day.audit", "business_day", "Ejecutar auditoria nocturna"],
  ["business_day.close", "business_day", "Cerrar dia operativo"],
  ["business_day.reopen", "business_day", "Reabrir dia operativo"],
  ["reports.operational", "reports", "Consultar reportes operativos"],
  ["reports.financial", "reports", "Consultar reportes financieros"],
  ["reports.export", "reports", "Exportar reportes"],
  ["reports.closed_snapshot", "reports", "Consultar reportes cerrados"],
  ["invoices.view", "invoices", "Consultar facturas"],
  ["invoices.draft", "invoices", "Preparar factura"],
  ["invoices.issue", "invoices", "Emitir factura"],
  ["invoices.cancel", "invoices", "Cancelar factura"],
  ["invoices.configure", "invoices", "Configurar facturacion"],
  ["audit.view", "audit", "Consultar bitacora"],
  ["audit.export", "audit", "Exportar bitacora"]
];

const ALL = PERMISSIONS.map(([code]) => code);
const READ_ONLY = [
  "reservations.view", "stays.view", "rack.view", "ledger.view",
  "business_day.view", "reports.operational", "reports.closed_snapshot"
];

const ROLE_PERMISSIONS = {
  admin: ALL,
  management: ALL.filter(code => !code.startsWith("users.") && code !== "roles.manage" && code !== "invoices.configure"),
  night_auditor: [
    ...READ_ONLY, "ledger.charge", "ledger.payment", "cash.open", "cash.view_own",
    "cash.view_all", "cash.close", "cash.reconcile", "business_day.audit",
    "business_day.close", "reports.financial", "reports.export", "audit.view"
  ],
  front_desk: [
    "reservations.view", "reservations.create", "reservations.update", "stays.view",
    "stays.checkin", "stays.update", "stays.move_room", "stays.checkout", "rack.view",
    "rack.update_manual_state", "rack.block", "ledger.view", "ledger.charge",
    "ledger.payment", "ledger.adjust", "business_day.view", "reports.operational"
  ],
  cashier: [
    "ledger.view", "ledger.payment", "ledger.adjust", "cash.open", "cash.view_own",
    "cash.close", "cash.reconcile", "business_day.view"
  ],
  sales: [
    "reservations.view", "reservations.create", "reservations.update", "reservations.cancel",
    "stays.view", "ledger.view", "ledger.payment", "business_day.view", "invoices.view",
    "invoices.draft"
  ],
  accounting: [
    "reservations.view", "stays.view", "ledger.view", "ledger.payment", "ledger.transfer",
    "ledger.adjust", "ledger.authorize_discount", "ledger.authorize_refund",
    "ledger.authorize_credit", "cash.view_all", "business_day.view",
    "reports.operational", "reports.financial", "reports.export", "reports.closed_snapshot",
    "invoices.view", "invoices.draft", "invoices.issue", "invoices.cancel",
    "audit.view", "audit.export"
  ],
  viewer: READ_ONLY
};

module.exports = { PERMISSIONS, ROLES, ROLE_PERMISSIONS };
