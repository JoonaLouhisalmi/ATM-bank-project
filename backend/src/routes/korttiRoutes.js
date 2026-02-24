//tänne kortti juttut
import express from 'express';
import kortti from '../models/korttiModel.js';

const router = express.Router();

// Hae kaikki asiakkaan kortit (toimii asiakas_id:llä)
router.get('/asiakas/:asiakasId', function(req, res) {
  kortti.getByCustomer(req.params.asiakasId, function(err, result) {
    if (err) {
      res.send(err);
    } else {
      res.json(result);
    }
  });
});

// Hae tietyn kortin tiedot (toimii )
router.get('/korttiDetails/:korttiId', function(req, res) {
  kortti.getById(req.params.korttiId, function(err, result) {
    if (err) {
      res.send(err);
    } else {
      if (!result || result.length === 0) return res.status(404).json({ error: 'Korttia ei löydy' });//toimii'ish 
      res.json(result[0]);
    }
  });
});

// Luo uusi kortti (toimii)
router.post('/', function(req, res) {
  kortti.create(req.body, function(err, result) {
    if (err) {
      res.send(err);
    } else {
      res.status(201).json(result);
    }
  });
});


// Hae kortin saldo (toimii)
router.get('/:korttiId/balance', function(req, res) {
  kortti.getBalance(req.params.korttiId, function(err, result) {
    if (err) {
      res.send(err);
    } else {
      res.json(result);
    }
  });
});

// Hakee kortti tapahtumat (toimii )
router.get('/:korttiId/transactions', function(req, res) {
  kortti.getTransactions(req.params.korttiId, function(err, result) {
    if (err) {
      res.send(err);
    } else {
      res.json(result);
    }
  });
});


// Kortin lukitus/avaus (TOIMII)
router.put('/:korttiId/status', function(req, res) {
  kortti.updateStatus(req.params.korttiId, req.body.status, function(err, result) {
    if (err) {
      res.send(err);
    } else {
      res.json(result);
    }
  });
});


// PIN:in vaihto (toimii)
router.put('/:korttiId/pinVaihto', function(req, res) {
  kortti.updatePin(req.params.korttiId, req.body.pin, function(err, result) {
    if (err) {
      res.send(err);
    } else {
      res.json({ message: 'PIN vaihto onnistui' });
    }
  });
});

// PIN-koodin virheiden laskuri
router.get('/:korttiId/virhelaskuri', function(req, res) {
  kortti.getVirhelaskuri(req.params.korttiId, function(err, result) {
    if (err) {
      res.send(err);
    } else {
      res.json(result);
    }
  });
});

router.get('/:korttiId/virhelaskuri-ja-tila', function(req, res) {
  kortti.getVirhelaskuriJaTila(req.params.korttiId, function(err, result) {
    if (err) {
      res.send(err);
    } else {
      res.json(result);
    }
  });
});


export default router;
