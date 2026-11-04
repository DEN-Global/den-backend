CREATE TRIGGER den_service_wallet_alert AFTER INSERT ON den_service_wallet_entries BEGIN
 INSERT INTO den_notifications(id,user_id,message,created_at) VALUES('wallet:'||NEW.id,NEW.user_id,'Wallet transaction recorded: '||NEW.currency||' '||printf('%.2f',NEW.amount_minor/100.0)||' · '||NEW.reference,NEW.created_at);
END;
