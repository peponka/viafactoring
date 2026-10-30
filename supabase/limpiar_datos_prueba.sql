-- =====================================================================
-- ViaFactoring · Limpieza de datos de prueba antes de abrir a usuarios reales
-- =====================================================================
-- Qué BORRA: facturas, ofertas, desbloqueos, chats, documentos (registros),
--   notificaciones, verificaciones, excepciones, pagos/comisiones, créditos
--   y el registro de auditoría de las pruebas.
-- Qué CONSERVA: las cuentas (usuarios y perfiles, incluidas las categorías de
--   fondeador), la configuración, rubros, packs, tipos de cambio,
--   preferencias de notificación y suscripciones push.
--
-- Es todo-o-nada: si algo falla, no se borra nada.
-- Los ARCHIVOS subidos (PDFs de facturas y verificaciones) se borran aparte,
-- desde Storage en el panel de Supabase.
-- =====================================================================

begin;

-- El registro de auditoría está bloqueado contra borrados (a propósito).
-- Lo destrabamos solo durante esta transacción.
alter table public.audit_logs disable trigger audit_logs_no_update;

-- Tablas hijas primero, después las facturas.
do $$
declare
  t text;
begin
  foreach t in array array[
    'messages', 'documents', 'notifications', 'exceptions',
    'invoice_pasadas', 'reveals', 'offers',
    'payment_events', 'payment_requests', 'credit_transactions',
    'invoices'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('delete from public.%I', t);
    end if;
  end loop;
end $$;

-- Créditos del modelo viejo: quedan en cero, sin borrar la fila.
update public.fondeador_credits set balance = 0, updated_at = now() where balance <> 0;

-- Por último, la auditoría (incluye lo que generaron los borrados de arriba).
delete from public.audit_logs;

alter table public.audit_logs enable trigger audit_logs_no_update;

commit;

-- Verificación: todo en 0 menos usuarios.
select 'facturas' as que, count(*) from public.invoices
union all select 'ofertas', count(*) from public.offers
union all select 'mensajes', count(*) from public.messages
union all select 'documentos', count(*) from public.documents
union all select 'notificaciones', count(*) from public.notifications
union all select 'auditoria', count(*) from public.audit_logs
union all select 'usuarios (se conservan)', count(*) from public.profiles;
