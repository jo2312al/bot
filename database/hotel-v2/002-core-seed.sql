-- Roles y permisos base para una instalación nueva de HotelFlow v2.
INSERT INTO app_roles (code, name, active) VALUES
  ('admin', 'Administrador', 1),
  ('management', 'Gerencia', 1),
  ('front_desk', 'Recepción', 1),
  ('cashier', 'Caja', 1),
  ('accounting', 'Contabilidad', 1),
  ('viewer', 'Consulta', 1)
ON DUPLICATE KEY UPDATE name = VALUES(name), active = VALUES(active);

INSERT INTO app_permissions (code, module_code, name) VALUES
  ('reservations.view', 'reservations', 'Consultar reservaciones'),
  ('reservations.create', 'reservations', 'Crear reservaciones'),
  ('reservations.cancel', 'reservations', 'Cancelar reservaciones'),
  ('stays.checkin', 'stays', 'Registrar check-in'),
  ('stays.change_room', 'stays', 'Cambiar habitación'),
  ('stays.checkout', 'stays', 'Registrar check-out'),
  ('folios.view', 'folios', 'Consultar saldos'),
  ('payments.create', 'payments', 'Registrar pagos'),
  ('payments.refund', 'payments', 'Registrar devoluciones'),
  ('cash.open', 'cash', 'Abrir caja'),
  ('cash.close', 'cash', 'Cerrar caja'),
  ('cash.reopen', 'cash', 'Reabrir caja'),
  ('operating_days.close', 'operating_days', 'Cerrar día operativo'),
  ('rooms.update_state', 'rooms', 'Cambiar estado de habitación'),
  ('guests.merge', 'guests', 'Fusionar huéspedes'),
  ('reports.view', 'reports', 'Consultar reportes'),
  ('users.manage', 'users', 'Administrar usuarios'),
  ('audit.view', 'audit', 'Consultar auditoría')
ON DUPLICATE KEY UPDATE module_code = VALUES(module_code), name = VALUES(name);

INSERT IGNORE INTO app_role_permissions (role_id, permission_id)
SELECT role.id, permission.id
FROM app_roles role
JOIN app_permissions permission
WHERE role.code = 'admin';
