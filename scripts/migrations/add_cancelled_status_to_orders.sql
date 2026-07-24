-- Migration to add 'Cancelled' and 'Rescheduled' to orders.status ENUM

ALTER TABLE orders MODIFY COLUMN status ENUM(
  'Pending', 'Assigned', 'Transit', 'Arrived', 'Washing', 'Drying', 
  'Ironing', 'QualityCheck', 'ReadyToDeliver', 'Collected', 
  'Delivered', 'Completed', 'Cancelled', 'Rescheduled'
) NOT NULL DEFAULT 'Pending';
