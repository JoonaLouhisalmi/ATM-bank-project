#include "mainwindow.h"
#include "./ui_mainwindow.h"
#include "kortinvalintawindow.h"
#include "debitwindow.h"
#include "creditwindow.h"
#include "environment.h"
#include "idlemanager.h"
#include <QUrl>
#include <QDebug>
#include <QPixmap>
#include "config.h"
#include <QTimer>

MainWindow::MainWindow(QWidget *parent)
    : QMainWindow(parent)
    , ui(new Ui::MainWindow)
{
    ui->setupUi(this);

    connect(ui->textUsername, &QLineEdit::returnPressed, ui->BtnLogin, &QPushButton::click);
    connect(ui->textUserpassword, &QLineEdit::returnPressed, ui->BtnLogin, &QPushButton::click);
    connect(ui->BtnLogin, &QPushButton::clicked, this, &MainWindow::btnLoginSlot);
    manager = new QNetworkAccessManager(this);

    connect(IdleManager::instance(), &IdleManager::idleTimeout,
            this, &MainWindow::handleIdleTimeout);

    errorTimer = new QTimer(this);
    errorTimer->setSingleShot(true);
    connect(errorTimer, &QTimer::timeout, this, [this]() {
        ui->labelPinVaarin->setVisible(false);
    });
}

MainWindow::~MainWindow()
{
    delete ui;
}

void MainWindow::showEvent(QShowEvent *event)
{
    QMainWindow::showEvent(event);
    IdleManager::instance()->start(10000);
}

void MainWindow::btnLoginSlot()
{
    const QString url = Environment::base_url() + "auth/verify-pin";
    QNetworkRequest request((QUrl(url)));
    request.setHeader(QNetworkRequest::ContentTypeHeader, "application/json");

    QJsonObject jObject;
    jObject.insert("kortti_numero", ui->textUsername->text());
    jObject.insert("pin", ui->textUserpassword->text());

    const QJsonDocument jsonDoc(jObject);

    reply = manager->post(request, jsonDoc.toJson());
    connect(reply, &QNetworkReply::finished, this, &MainWindow::loginAction);
}

void MainWindow::showErrorBubble(const QString &msg)
{
    ui->labelPinVaarin->setText(msg);
    ui->labelPinVaarin->setVisible(true);
    errorTimer->start(3000);

    connect(ui->textUsername, &QLineEdit::textEdited, this, [this]() {
        ui->labelPinVaarin->setVisible(false);
    });
    connect(ui->textUserpassword, &QLineEdit::textEdited, this, [this]() {
        ui->labelPinVaarin->setVisible(false);
    });
}

void MainWindow::loginAction()
{
    const QByteArray responseData = reply->readAll();
    DBG() << "Full login response JSON:" << responseData;

    if (reply->error() != QNetworkReply::NoError) {
        DBG() << "verify-pin failed:" << reply->errorString();
        DBG() << "server response:" << responseData;
        reply->deleteLater();
        reply = nullptr;
        return;
    }

    QJsonParseError parseError{};
    const QJsonDocument doc = QJsonDocument::fromJson(responseData, &parseError);
    if (parseError.error != QJsonParseError::NoError || !doc.isObject()) {
        DBG() << "verify-pin response   " << parseError.errorString();
        DBG() << "server response:" << responseData;
        reply->deleteLater();
        reply = nullptr;
        return;
    }

    const QJsonObject obj = doc.object();

    {
        const bool success = obj.value("success").toBool(false);
        const QString message = obj.value("message").toString();
        const int yrityksiaJaljella = obj.value("yrityksiä_jäljellä").toInt(-1);

        if (!success) {

            if (message.contains("kortti lukittu", Qt::CaseInsensitive)) {
                showErrorBubble(message);
                ui->textUserpassword->clear();
                ui->textUserpassword->setFocus();
                reply->deleteLater();
                reply = nullptr;
                return;
            }

            if (message.contains("väliaikaisesti lukittu", Qt::CaseInsensitive)) {
                showErrorBubble(message);
                ui->textUserpassword->clear();
                ui->textUserpassword->setFocus();
                reply->deleteLater();
                reply = nullptr;
                return;
            }

            if (message.contains("ei ole aktiivinen", Qt::CaseInsensitive)) {
                showErrorBubble(message);
                ui->textUserpassword->clear();
                ui->textUserpassword->setFocus();
                reply->deleteLater();
                reply = nullptr;
                return;
            }

            if (message.contains("Väärä PIN", Qt::CaseInsensitive)) {
                QString teksti = message;
                if (yrityksiaJaljella >= 0) {
                    teksti += QString(" (%1)").arg(yrityksiaJaljella);
                }
                showErrorBubble(teksti);
                ui->textUserpassword->clear();
                ui->textUserpassword->setFocus();
                reply->deleteLater();
                reply = nullptr;
                return;
            }

            showErrorBubble(message.isEmpty() ? "Tuntematon virhe" : message);
            reply->deleteLater();
            reply = nullptr;
            return;
        }
    }

    const QString tokenString = obj.value("token").toString();
    const int serverKorttiId  = obj.value("kortti_id").toInt(0);
    const QString cardType    = obj.value("cardType").toString().toUpper();
    const QJsonArray tilit    = obj.value("tilit").toArray();

    asiakasKuva = obj.value("kuva").toString();
    DBG() << "Asiakkaan kuva:" << asiakasKuva;

    if (tokenString.isEmpty() || serverKorttiId <= 0) {
        DBG() << "verify-pin OK mutta token puuttuu:" << doc;
        reply->deleteLater();
        reply = nullptr;
        return;
    }

    webToken = tokenString.toUtf8();
    kortti_id = serverKorttiId;

    DBG() << "Token jemmassa" << webToken.size();
    DBG() << "kortti_id:" << kortti_id;
    DBG() << "cardType:" << cardType;

    IdleManager::instance()->start(30000);

    int debitTiliId  = 0;
    int creditTiliId = 0;

    for (const QJsonValue &val : tilit) {
        QJsonObject tiliObj = val.toObject();
        QString rooli   = tiliObj.value("rooli").toString().toUpper();
        int     tiliId  = tiliObj.value("tili_id").toInt(0);

        if (rooli == "DEBIT"  && tiliId > 0) debitTiliId  = tiliId;
        if (rooli == "CREDIT" && tiliId > 0) creditTiliId = tiliId;
    }
    DBG() << "Löydettiin debit tili_id:" << debitTiliId;
    DBG() << "Löydettiin credit tili_id:" << creditTiliId;

    bool useSelectionWindow = (cardType == "COMBO") || (debitTiliId > 0 && creditTiliId > 0);

    if (!useSelectionWindow) {

        if (cardType == "DEBIT" && debitTiliId > 0) {
            DBG() << "DEBIT-kortti → suoraan DebitWindow";
            auto *d = new DebitWindow(webToken, debitTiliId, kortti_id, manager, asiakasKuva);
            d->setAttribute(Qt::WA_DeleteOnClose);
            connect(d, &DebitWindow::logoutValittu, this, &MainWindow::handleLogoutSignal);
            d->show();
            this->hide();
        }
        else if (cardType == "CREDIT" && creditTiliId > 0) {
            DBG() << "CREDIT-kortti → suoraan CreditWindow";
            auto *c = new CreditWindow(webToken, creditTiliId, kortti_id, manager, asiakasKuva);
            c->setAttribute(Qt::WA_DeleteOnClose);
            connect(c, &CreditWindow::logoutValittu, this, &MainWindow::handleLogoutSignal);
            c->show();
            this->hide();
        }
        else {
            DBG() << "Ei debit- eikä credit-tiliä → virhe";
        }
    }
    else {

        DBG() << "COMBO tai useita tilejä → näytetään KortinValintaWindow";

        auto *w = new KortinValintaWindow();
        w->setAttribute(Qt::WA_DeleteOnClose);

        connect(w, &KortinValintaWindow::debitValittu, this, [this, debitTiliId]() {
            DBG() << "Debit valittu, käytetään tili_id:" << debitTiliId;

            if (debitTiliId > 0) {
                auto *d = new DebitWindow(webToken, debitTiliId, kortti_id, manager, asiakasKuva);
                d->setAttribute(Qt::WA_DeleteOnClose);
                connect(d, &DebitWindow::logoutValittu, this, &MainWindow::handleLogoutSignal);
                d->show();
                this->hide();
            }
        });

        connect(w, &KortinValintaWindow::creditValittu, this, [this, creditTiliId]() {
            DBG() << "Credit valittu, käytetään tili_id:" << creditTiliId;
            if (creditTiliId > 0) {
                auto *c = new CreditWindow(webToken, creditTiliId, kortti_id, manager, asiakasKuva);
                c->setAttribute(Qt::WA_DeleteOnClose);
                connect(c, &CreditWindow::logoutValittu, this, &MainWindow::handleLogoutSignal);
                c->show();
                this->hide();
            } else {
                DBG() << "Virhe: credit-tiliä ei löytynyt vaikka CREDIT valittiin";
            }
        });

        connect(w, &KortinValintaWindow::logoutValittu, this, &MainWindow::handleLogoutSignal);

        w->show();
        this->hide();
    }

    reply->deleteLater();
    reply = nullptr;
}

void MainWindow::resetLogin()
{
    ui->textUsername->clear();
    ui->textUserpassword->clear();
    ui->textUsername->setText("");
    ui->textUserpassword->setText("");
    ui->textUsername->setFocus();
    webToken = "";
    kortti_id =  0;
}

void MainWindow::handleLogoutSignal()
{
    IdleManager::instance()->stop();
    resetLogin();
    this->show();

    connect(IdleManager::instance(), &IdleManager::idleTimeout,
            this, &MainWindow::handleIdleTimeout);
}

void MainWindow::handleIdleTimeout()
{
    // Tarkista, onko mainwindow näkyvissä - jos ei, älä tee mitään
    if (!this->isVisible()) {
        return;
    }

    DBG() << "Idle timeout -> automaattinen logout";

    for (QWidget *w : QApplication::topLevelWidgets()) {
        if (w != this && w->isVisible()) {
            w->close();
        }
    }

    resetLogin();
    this->show();

    IdleManager::instance()->start(10000);
}
