-- Migración para renombrar el estado 'Invoiced'/'invoiced' a 'facturado' en la tabla de órdenes

-- 1. Modificar el ENUM para permitir el nuevo valor 'facturado'
ALTER TABLE orders MODIFY COLUMN status ENUM(
  'Pending', 'Assigned', 'Transit', 'Arrived', 'Washing', 'Drying', 
  'Ironing', 'QualityCheck', 'ReadyToDeliver', 'Collected', 
  'Delivered', 'Invoiced', 'facturado', 'Completed'
) NOT NULL DEFAULT 'Pending';

-- 2. Actualizar los registros existentes
UPDATE orders SET status = 'facturado' WHERE status IN ('Invoiced', 'invoiced');

-- 3. Quitar el valor antiguo 'Invoiced' del ENUM
-- (Opcional, pero recomendado para limpieza)
ALTER TABLE orders MODIFY COLUMN status ENUM(
  'Pending', 'Assigned', 'Transit', 'Arrived', 'Washing', 'Drying', 
  'Ironing', 'QualityCheck', 'ReadyToDeliver', 'Collected', 
  'Delivered', 'facturado', 'Completed'
) NOT NULL DEFAULT 'Pending';

-- 4. Audit history (opcional: renombrar historial pasado si se desea total consistencia visual)
UPDATE order_status_history SET status = 'facturado' WHERE status IN ('Invoiced', 'invoiced');
