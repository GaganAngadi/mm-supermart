ALTER TABLE `Product`
  MODIFY COLUMN `barcode` VARCHAR(50) NULL,
  ADD COLUMN `barcode_type` VARCHAR(20) NULL,
  ADD COLUMN `qr_code` TEXT NULL,
  ADD COLUMN `last_printed_at` DATETIME(3) NULL;
