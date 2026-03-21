-- Index composite pour optimiser les requetes de notifications par utilisateur
-- Couvre le pattern: SELECT ... FROM user_notifications WHERE user_id = ? AND is_read = ? ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS idx_user_notifications_user_read_created
ON user_notifications(user_id, is_read, created_at DESC);
