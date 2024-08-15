require("dotenv").config();

const binance = require("./binance");
const inkluziva = require("./server");
const logger = require("chegs-simple-logger");
const path = require("path");

log = new logger({
  logGeneral: true,
  logWarning: true,
  logError: true,
  writeLog: true,
  prefix: " ",
  fileName: "output.txt",
  filePath: path.join(__dirname, "logs"),
  fileSize: "10M",
  fileAge: 1,
  fileCount: 5,
});

var readOrders = {};

async function run() {
  log.general("Starting bot");
  setInterval(async () => {
    try {

    } catch (error) {

    }
  }, 5 * 1000);
  await monitorP2PPayment();
}


async function monitorP2PPayment() {
  log.general("Starting monitorP2PPayment function");
  try {
    log.general("Calling inkluziva.getTradesApprovedToRelease");
    let orders;
    try {
      orders = await inkluziva.getTradesApprovedToRelease();
    } catch (error) {
      log.error(`Error calling inkluziva.getTradesApprovedToRelease: ${error ? (error.message || error) : 'Unknown error'}`, error);
      return; // Interrompe a execução se ocorrer um erro ao obter as ordens
    }
    log.general(`Retrieved orders to release: ${orders.length}`);

    for (const o of orders) {
      try {
        log.general(`Processing order: ${o.orderNumber}`);
        const currentOrders = await binance.getOrderMatchListByMerchant();
        log.general(`Retrieved current orders: ${currentOrders.length}`);

        var ativa = false;
        for (const co of currentOrders) {
          if (co.orderNumber == o.orderNumber) {
            ativa = true;
          }
        }
        if (ativa) {
          log.general(`Order is active: ${o.orderNumber}`);
          await releaseP2PPayment(o.orderNumber);
        }
      } catch (error) {
        log.error(`Error processing order ${o.orderNumber}: ${error ? (error.message || error) : 'Unknown error'}`, error);
      }
      await new Promise((resolve) => setTimeout(resolve, 15000));
    }
  } catch (error) {
    log.error(`Error at bot.monitorP2PPayment: ${error ? (error.message || error) : 'Unknown error'}`, error);
  }
  await new Promise((resolve) => setTimeout(resolve, 10000));
  log.general("Restarting monitorP2PPayment function");
  await monitorP2PPayment();
}


async function releaseP2PPayment(orderNumber) {
  return new Promise(async function (fulfill, reject) {
    try {
      log.general(`Liberando pagamento ordem ${orderNumber}`);
      const bizNo = await binance.confirmOrderPayed(orderNumber);
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const steps = await binance.getSteps(bizNo);
      await new Promise((resolve) => setTimeout(resolve, 1500));
      if (steps.challengeSteps[0].stepList.indexOf("EMAIL") >= 0) {
        await binance.sendEmailVerifyCode(bizNo);
        await new Promise((resolve) => setTimeout(resolve, 15000));
        const emailCode = await inkluziva.getBinanceCodeEmail();
        await binance.verifySingleFactor(bizNo, "EMAIL", emailCode);
      }
      if (steps.challengeSteps[0].stepList.indexOf("GOOGLE") >= 0) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        const googleCode = await inkluziva.getBinanceCodeOTP();
        await binance.verifySingleFactor(bizNo, "GOOGLE", googleCode);
      }
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const challengeToken = await binance.getChallengeToken(bizNo);
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await binance.confirmOrderPayed(orderNumber, bizNo, challengeToken);
      log.general(`Ordem ${orderNumber} liberada com sucesso`);
      fulfill();
    } catch (error) {
      log.error(`Error at bot.releaseP2PPayment: ${error}`);
      reject(error);
    }
  });
}


run();
