import express from 'express';
import auth from '../models/authModel.js';
import jwt from 'jsonwebtoken';

const router = express.Router();

router.post('/verify-pin', function (request, response) {

    let { kortti_numero, pin } = request.body;
    if (kortti_numero) kortti_numero = kortti_numero.trim();
    if (pin) pin = pin.trim();

    console.log("--- DEBUG START ---");
    console.log(`Saatu korttinumero: '${kortti_numero}'`);
    console.log(`Pituus: ${kortti_numero ? kortti_numero.length : 0}`);
    console.log(`Saatu PIN: '${pin}'`);
    console.log("--- DEBUG END ---");

    if (!kortti_numero || !pin) {
        return response.json({
            success: false,
            message: 'Korttinumero tai PIN puuttuu'
        });
    }

    auth.getKorttiByNumero(kortti_numero, function (err, korttiResult) {

        if (err) {
            return response.json(err);
        }

        if (korttiResult.length === 0) {
            return response.json({
                success: false,
                message: 'Korttia ei löydy'
            });
        }

        const kortti = korttiResult[0];

        if (kortti.tila !== 'ACTIVE') {
            return response.json({
                success: false,
                message: 'Kortti ei ole aktiivinen'
            });
        }

        auth.getPinYrityys(kortti.kortti_id, function (err, pinResult) {

            if (err) {
                return response.json(err);
            }

            if (pinResult.length === 0) {
                return response.json({
                    success: false,
                    message: 'PIN-yritystietoja ei löydy'
                });
            }

            const pinYritys = pinResult[0];

            if (pinYritys.lukossa_asti && new Date(pinYritys.lukossa_asti) > new Date()) {
                return response.json({
                    success: false,
                    message: 'Kortti on väliaikaisesti lukittu'
                });
            }

            auth.verifyPin(pin, kortti.pin_bcrypt, function (err, isMatch) {

                if (err) {
                    return response.json(err);
                }

                if (!isMatch) {

                    auth.incrementPinError(kortti.kortti_id, function () {

                        if (pinYritys.virhelaskuri + 1 >= 3) {

                            auth.resetPinError(kortti.kortti_id, function () {

                                auth.lockPinYrityys(kortti.kortti_id, function () {
                                    auth.lockCard(kortti.kortti_id, function () {
                                        return response.json({
                                            success: false,
                                            message: 'Kortti lukittu liian monen virheellisen PIN-yrityksen vuoksi'
                                        });
                                    });
                                });

                            });

                        } else {
                            return response.json({
                                success: false,
                                message: 'PIN väärin',
                                yrityksiä_jäljellä: 3 - (pinYritys.virhelaskuri + 1)
                            });
                        }
                    });

                } else {

                    auth.resetPinError(kortti.kortti_id, function () {

                        auth.getAsiakasByKorttiId(kortti.kortti_id, function (err, asiakasRows) {
                            if (err || asiakasRows.length === 0) {
                                return response.json({ success: false, message: 'Asiakastietoja ei löydy' });
                            }

                            const asiakas = asiakasRows[0];

                            auth.getKorttiTilit(kortti.kortti_id, function (err, tiliRows) {
                                if (err) {
                                    console.error('getKorttiTilit virhe:', err);
                                    return response.json({ success: false, message: 'Tietokantavirhe' });
                                }

                                if (!tiliRows || tiliRows.length === 0) {
                                    return response.json({
                                        success: false,
                                        message: 'Kortille ei ole liitetty yhtään aktiivista tiliä'
                                    });
                                }

                                const roles = tiliRows.map(r => r.rooli);
                                let cardType = 'UNKNOWN';
                                if (roles.includes('DEBIT') && roles.includes('CREDIT')) {
                                    cardType = 'COMBO';
                                } else if (roles.includes('DEBIT')) {
                                    cardType = 'DEBIT';
                                } else if (roles.includes('CREDIT')) {
                                    cardType = 'CREDIT';
                                }

                                const token = generateAccessToken(kortti.kortti_id);

                                const tilit = tiliRows.map(row => ({
                                    tili_id: row.tili_id,
                                    rooli: row.rooli,
                                }));

                                response.json({
                                    success: true,
                                    message: 'PIN oikein',
                                    kortti_id: kortti.kortti_id,
                                    token: token,
                                    cardType: cardType,
                                    tilit: tilit,
                                    kuva: asiakas.kuva
                                });

                                console.log(`Kirjautuminen onnistui kortti_id=${kortti.kortti_id}, cardType=${cardType}, tilit:`, tilit);
                            })
                        });
                    });
                }
            });
        });
    });
});

function generateAccessToken(kortti_id) {
    return jwt.sign({ kortti_id }, process.env.MY_TOKEN, { expiresIn: '18000s' });
}

export default router;
