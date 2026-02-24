import { getPool } from '../db.js';
import bcrypt from 'bcryptjs';

const kortti = {
  // Hae kaikki asiakkaan kortit
  getByCustomer: async function(customerId, callback) {
    try {
      const pool = getPool();
      const [rows] = await pool.execute('SELECT * FROM Kortti WHERE asiakas_id = ?', [customerId]);
      return callback(null, rows);
    } catch (err) {
      return callback(err);
    }
  },

  // Hae tietyn kortin tiedot
  getById: async function(cardId, callback) {
    try {
      const pool = await getPool();
        // Get all card info including hash
        const [rows] = await pool.execute('SELECT * FROM Kortti WHERE kortti_id = ?', [cardId]);
        // Get the unhashed PIN (assuming you have a column for the plain PIN, e.g., pin_code)
        // If not, you cannot retrieve the original PIN from the hash
        let pinCode = null;
        try {
          const [pinRows] = await pool.execute('SELECT pin_code FROM Kortti WHERE kortti_id = ?', [cardId]);
          if (pinRows.length > 0) {
            pinCode = pinRows[0].pin_code;
          }
        } catch (err) {
          // If pin_code column does not exist, pinCode remains null
        }
        const result = rows.map(row => ({ ...row, pin_code: pinCode }));
        callback(null, result);
    } catch (err) {
      return callback(err);
    }
  },

  // Luo uusi kortti
  create: async function(cardData, callback) {
    try {
      if (!cardData.pin || !cardData.asiakas_id || !cardData.kortti_numero) {
        return callback(new Error('puuttuvia tietoja'));
      }
      const pinHash = bcrypt.hashSync(cardData.pin, 10);
      const pool = getPool();
      const [result] = await pool.execute(
        'INSERT INTO Kortti (kortti_numero, asiakas_id, pin_bcrypt, tila) VALUES (?, ?, ?, ?)',
        [cardData.kortti_numero, cardData.asiakas_id, pinHash, cardData.tila || 'ACTIVE']
      );
      return callback(null, { kortti_id: result.insertId, ...cardData });
    } catch (err) {
      return callback(err);
    }
  },

  // Hae kortin saldot
  getBalance: async function(cardId, callback) {
    try {
      const pool = getPool();
      const [rows] = await pool.execute(
        `SELECT t.saldo_eur, t.credit_limit, k.kortti_numero
         FROM Kortti k
         JOIN KorttiTili kt ON k.kortti_id = kt.kortti_id
         JOIN Tili t ON kt.tili_id = t.tili_id
         WHERE k.kortti_id = ? AND kt.rooli = 'DEBIT'`,
        [cardId]
      );
      return callback(null, rows[0] || {});
    } catch (err) {
      return callback(err);
    }
  },

  // Hae kaikki tapahtumat kortille
  getTransactions: async function(cardId, callback) {
    try {
      const pool = getPool();
      const [rows] = await pool.execute(
        'SELECT * FROM Tilitapahtuma WHERE kortti_id = ? ORDER BY tapahtuma_aika DESC',
        [cardId]
      );
      return callback(null, rows);
    } catch (err) {
      return callback(err);
    }
  },

  // Päivitä kortin tila
  updateStatus: async function(cardId, status, callback) {
    try {
      const validStatuses = ['ACTIVE', 'LOCKED', 'CLOSED'];  //tarkasta kaikki määritykset!!
      if (!validStatuses.includes(status)) {
        return callback(new Error);
      }
      const pool = getPool();
      const [result] = await pool.execute(
        'UPDATE Kortti SET tila = ? WHERE kortti_id = ?',
        [status, cardId]
      );
      return callback(null, { affectedRows: result.affectedRows });
    } catch (err) {
      callback(err);
    }
  },

  // Päivitä kortin PIN
  updatePin: async function(cardId, newPin, callback) {
    try {
      if (!newPin || typeof newPin !== 'string' || newPin.length < 4) {
        return callback(new Error);
      }
      const pinHash = bcrypt.hashSync(newPin, 10);
      const pool = getPool();
      await pool.execute('UPDATE Kortti SET pin_bcrypt = ? WHERE kortti_id = ?', [pinHash, cardId]);
      return callback(null, { message: 'Pin koodi vaihdettu' });
    } catch (err) {
      return callback(err);
    }
  },
// Hae kortin virhelaskuri PinPool-taulusta
getVirhelaskuri: async function(cardId, callback) {
  try {
    const pool = getPool();
    const [rows] = await pool.execute(
      'SELECT kortti_id, virhelaskuri FROM PinPool WHERE kortti_id = ?',
      [cardId]
    );
    return callback(null, rows);
  } catch (err) {
    return callback(err);
  }
},
// Hae virhelaskuri + kortin tila
getVirhelaskuriJaTila: async function(cardId, callback) {
  try {
    const pool = getPool();
    const [rows] = await pool.execute(
      `SELECT p.kortti_id, p.virhelaskuri, k.tila
       FROM PinPool p
       JOIN Kortti k ON p.kortti_id = k.kortti_id
       WHERE p.kortti_id = ?`,
      [cardId]
    );

    return callback(null, rows);
  } catch (err) {
    return callback(err);
  }
},
};
export default kortti;
