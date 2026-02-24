#ifndef MAINWINDOW_H
#define MAINWINDOW_H
#include <QByteArray>
#include <QNetworkAccessManager>
#include <QNetworkReply>
#include <QNetworkRequest>
#include <QJsonDocument>
#include <QJsonObject>
#include <QJsonArray>
#include <QMainWindow>
#include <QShowEvent>

QT_BEGIN_NAMESPACE
namespace Ui {
class MainWindow;
}
QT_END_NAMESPACE

class MainWindow : public QMainWindow
{
    Q_OBJECT

public:
    explicit  MainWindow(QWidget *parent = nullptr);
    ~MainWindow();

public slots:
    void resetLogin();

private:
    Ui::MainWindow *ui;
    QNetworkAccessManager *manager = nullptr;
    QNetworkReply *reply = nullptr;
    QByteArray webToken;
    QString asiakasKuva;
    QTimer *errorTimer;   // aikakatkaisu virheilmoitukselle
    void showErrorBubble(const QString &msg);  // näytä virhelabel
    int kortti_id;
    int debit_tili_id;
    int credit_tili_id;

private slots:
    void btnLoginSlot();
    void loginAction();
    void handleIdleTimeout();
    void handleLogoutSignal();

protected:
    void showEvent(QShowEvent *event) override;

};
#endif // MAINWINDOW_H
