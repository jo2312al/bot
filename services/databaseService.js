// services/databaseService.js
// Mock architecture prepared for MySQL migration

class DatabaseService {
  constructor() {
    this.connected = false;
  }

  async connect() {
    this.connected = true;
    console.log("[DB] Conexión simulada a MySQL establecida");
  }

  async query(sql, params) {
    if (!this.connected) {
      await this.connect();
    }
    console.log(`[DB] Executing Query: ${sql}`, params);
    return [];
  }

  async saveReservation(data) {
    const sql = "INSERT INTO reservations SET ?";
    return this.query(sql, data);
  }

  async saveComplaint(data) {
    const sql = "INSERT INTO complaints SET ?";
    return this.query(sql, data);
  }
}

const db = new DatabaseService();

module.exports = db;
