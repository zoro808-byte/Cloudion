const express = require('express');
const router = express.Router();
const serverController = require('../controllers/serverController');
const { requireAuth } = require('../middleware/auth');

router.use(requireAuth);

router.get('/status', serverController.status);
router.get('/storage', serverController.storage);
router.get('/storage/report', serverController.storageReport);
router.post('/backup', serverController.createBackup);
router.get('/backup', serverController.listBackups);
router.post('/restore', serverController.restoreBackup);
router.post('/cleanup', serverController.cleanup);

module.exports = router;
