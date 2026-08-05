# Prompt para continuar la integracion en la pagina de pagos

Trabaja en el proyecto PHP ubicado en `C:\public_html\public_html`. Implementa y verifica una integracion segura para reservaciones telefonicas provenientes del dashboard Hotel Villa Margaritas.

## Flujo requerido

1. Recibir `POST /api/v1/reservations` con Bearer token, `Idempotency-Key`, `X-Timestamp` y `X-Signature`. La firma es HMAC-SHA256 de `timestamp + "." + cuerpo JSON exacto`. Rechazar firmas invalidas y timestamps con mas de 5 minutos.
2. Conservar cualquier folio válido recibido (letras, números y guiones; máximo 30 caracteres), crear la reserva como pendiente y devolver `folio`, `status` y `paymentUrl`.
3. Permitir buscar por folio en `/pago` y pagar el total completo de la estancia con Stripe.
4. Cuando Stripe confirme, marcar todas las habitaciones del grupo como confirmadas y la reservacion externa como pagada.
5. Enviar al bot un `POST` firmado a `HOTEL_BOT_PAYMENT_WEBHOOK_URL`, usando el mismo esquema HMAC y un `eventId` idempotente. Incluir folio, estado `paid`, total, moneda, fecha y el ID de Stripe.
6. Nunca colocar llaves o secretos en JavaScript, HTML, logs ni respuestas de error. Usar solamente variables de entorno y comparar firmas de forma segura.

## Variables de entorno

```env
RESERVATIONS_API_KEY=
RESERVATIONS_API_SIGNING_SECRET=
HOTEL_BOT_PAYMENT_WEBHOOK_URL=https://DASHBOARD/api/v1/payment-webhooks
HOTEL_BOT_PAYMENT_WEBHOOK_SECRET=
STRIPE_KEY=
STRIPE_SECRET=
STRIPE_WEBHOOK_SECRET=
```

Aplica la migracion `database/migrations/009_external_payment_sync.sql` y prueba: firma incorrecta, timestamp vencido, idempotencia, folio inexistente, pago exitoso y reintento del webhook.
