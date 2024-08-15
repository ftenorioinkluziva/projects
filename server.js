const express = require('express');
const dotenv = require('dotenv');
const path = require('path');
const WebSocket = require('ws');
const fs = require('fs');
const updateOrdersFromJson = require('./updateOrdersDB');
const pool = require('./db');
const BinanceAPI = require('./binanceAPI');
const BinanceService = require('./binanceService');
const OTPAuth = require('otpauth');
const OrderManager = require('./public/orderManager');
var ImapClient = require("emailjs-imap-client").default;
const logger = require("chegs-simple-logger");


dotenv.config();
const app = express();
const port = process.env.PORT || 3000;

if (!process.env.BINANCE_API_KEY || !process.env.BINANCE_API_SECRET) {
  throw new Error('BINANCE_API_KEY and BINANCE_API_SECRET must be defined in the environment variables');
}

const { fetchP2PData, fetchMarketData } = require('./binanceService');

const binance = new BinanceAPI(process.env.BINANCE_API_KEY, process.env.BINANCE_API_SECRET);

const orderManager = new OrderManager(binance);

// Logger setup
const log = new logger({
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

// Inicia o monitoramento de ordens assim que o servidor é iniciado
//orderManager.start().catch(error => {
//  console.error('Erro ao iniciar o monitoramento de ordens:', error);
//});

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

const ordersFilePath = path.join(__dirname, 'public', 'orders.json');


app.get('/order_messages/:orderNumber', async (req, res) => {
  const { orderNumber } = req.params;
  const { page, rows } = req.query;

  try {
    const messages = await binance.getMessages(orderNumber, page, rows);
    res.json(messages);
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ error: 'Error fetching messages' });
  }
});

app.get('/get_spot_balance', async (req, res) => {
  try {
    const balanceData = await binance.getSpotWalletBalance();
    res.json(balanceData);
  } catch (error) {
    console.error('Erro ao obter saldo da conta Spot:', error);
    res.status(500).json({ error: 'Erro ao obter saldo da conta Spot' });
  }
});

app.post('/transfer_spot_to_funding', async (req, res) => {
  const { asset, amount } = req.body;
  try {
    const transferResult = await binance.transferFromSpotToFunding(asset, amount);
    res.json(transferResult);
  } catch (error) {
    console.error('Erro ao transferir saldo:', error);
    res.status(500).json({ error: 'Erro ao transferir saldo' });
  }
});

app.post('/top_up_ad_balance', async (req, res) => {
  try {
    const { advNo, topUpAmount } = req.body;
    const updateResult = await binance.topUpAdBalance(advNo, topUpAmount);
    res.json(updateResult);
  } catch (error) {
    console.error('Error updating price:', error);
    res.status(500).json({ error: 'Error recharge ads' });
  }
});

app.get('/order_details/:orderNumber', async (req, res) => {
  try {
    const orderNumber = req.params.orderNumber;
    const orderDetails = await binance.getOrderDetails(orderNumber);
    res.json(orderDetails);
  } catch (error) {
    console.error('Error fetching order details:', error);
    res.status(500).json({ error: 'Error fetching order details' });
  }
});

app.post('/data_buy', async (req, res) => {
    const { proMerchantAds } = req.body;
    try {
      const data = await fetchP2PData('BUY', proMerchantAds);
      const dataMarket = await fetchMarketData();
      res.json({ p2pData: data, marketData: dataMarket });
    } catch (error) {
      console.error('Error fetching BUY data:', error);
      res.status(500).json({ error: 'Error fetching BUY data' });
    }
  });

  app.post('/data_sell', async (req, res) => {
    const { proMerchantAds } = req.body;
    try {
      const data = await fetchP2PData('SELL', proMerchantAds);
      const dataMarket = await fetchMarketData();
      res.json({ p2pData: data, marketData: dataMarket });
    } catch (error) {
      console.error('Error fetching SELL data:', error);
      res.status(500).json({ error: 'Error fetching BUY data' });
    }
  });  
  
  app.get('/ad_details/:adNum', async (req, res) => {
    try {
      const adNum = req.params.adNum;
      const adDetails = await binance.getAdDetails(adNum);
      res.json(adDetails);
    } catch (error) {
      console.error('Error fetching ad details:', error);
      res.status(500).json({ error: 'Error fetching ad details' });
    }
  });
  
  app.post('/update_price', async (req, res) => {
    try {
      const { advNo, price } = req.body;
      const updateResult = await binance.updatePrice(advNo, price);
      res.json(updateResult);
    } catch (error) {
      console.error('Error updating price:', error);
      res.status(500).json({ error: 'Error updating price' });
    }
  });
  
  app.post('/update_ad_status', async (req, res) => {
    try {
      const { advNo, advStatus } = req.body;
      //console.log(`Received request to update ad status for advNo: ${advNo} to ${advStatus}`);
      const updateResult = await binance.updateAdsStatus(advNo, advStatus);
      //console.log('Update result:', updateResult);
      res.json(updateResult);
    } catch (error) {
      console.error('Error updating ad status:', error);
      res.status(500).json({ error: 'Error updating ad status', details: error.message });
    }
  });
  
  async function loadExistingOrders() {
    try {
      if (fs.existsSync(ordersFilePath)) {
        const data = fs.readFileSync(ordersFilePath, 'utf8');
        return JSON.parse(data);
      }
    } catch (error) {
      console.error('Erro ao carregar o arquivo JSON existente:', error);
    }
    return { data: [] };
  }
  
  async function saveOrders(orders) {
    try {
      fs.writeFileSync(ordersFilePath, JSON.stringify(orders, null, 2));
      console.log("Arquivo JSON atualizado com sucesso");
    } catch (error) {
      console.error('Erro ao salvar o arquivo JSON:', error);
    }
  }


  async function updateOrdersAndPrices() {
      try {
        const existingOrders = await loadExistingOrders();
        const existingOrderNumbers = existingOrders.data.map(order => order.orderNumber);
    
        const tradeType = 'SELL';
        const page = 1;
        const rows = 100;
    
        const ordersResponse = await binance.getOrderList(tradeType, page, rows);
        const orders = ordersResponse.data;
    
        const newOrders = orders.filter(order => !existingOrderNumbers.includes(order.orderNumber));
    
        if (newOrders.length > 0) {
          await processNewOrders(newOrders);
          existingOrders.data = [...existingOrders.data, ...newOrders];
        }
    
        let statusUpdated = await updateExistingOrders(existingOrders, orders);
    
        if (newOrders.length > 0 || statusUpdated) {
          existingOrders.data.sort((a, b) => new Date(b.createTime) - new Date(a.createTime));
          await saveOrders(existingOrders);
        }
    
      } catch (error) {
        console.error('Erro ao atualizar as ordens:', error);
      } finally {
        updateOrdersFromJson();
        setTimeout(updateOrdersAndPrices, 5000);
      }
    }
    
  async function processNewOrders(newOrders) {
      for (const order of newOrders) {
        const orderNumber = order.orderNumber;
        try {
          const orderDetails = await binance.makeRequest('POST', '/sapi/v1/c2c/orderMatch/getUserOrderDetail', {}, { adOrderNo: orderNumber });
          order.counterPartNickName = orderDetails.data.buyerName;
    
          const buyerName = order.counterPartNickName;

          const token = await getToken();
          const responseInkluziva = await fetch(`${process.env.API_INKLUZIVA_PREFIX}/orders/p2p/update-buyer-name/${orderNumber}`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            signal: AbortSignal.timeout(10000),
            body: JSON.stringify({ buyerName }),
          });

          const responseInkluzivaJson = await responseInkluziva.json();
    
          if (responseInkluzivaJson.ok) {
            console.log(`Nome do comprador adicionado para a nova ordem ${orderNumber}`);
          } else {
            console.error(`Erro ao atualizar nome do comprador para ordem ${orderNumber}:`, responseInkluzivaJson.message);
          }
        } catch (detailError) {
          console.error(`Erro ao obter detalhes da nova ordem ${orderNumber}:`, detailError);
        }
      }
    }
    
  async function updateExistingOrders(existingOrders, currentOrders) {
      let statusUpdated = false;
    
      for (const existingOrder of existingOrders.data) {
        if (!['COMPLETED', 'CANCELLED', 'CANCELLED_BY_SYSTEM'].includes(existingOrder.orderStatus)) {
          const currentOrder = currentOrders.find(order => order.orderNumber === existingOrder.orderNumber);
    
          if (currentOrder && existingOrder.orderStatus !== currentOrder.orderStatus) {
            const previousStatus = existingOrder.orderStatus;
            existingOrder.orderStatus = currentOrder.orderStatus;
            statusUpdated = true;
            console.log(`Status atualizado para a ordem ${existingOrder.orderNumber} mudou de status: ${previousStatus} para ${existingOrder.orderStatus}`);
    
            if (currentOrder.orderStatus === 'COMPLETED') {
              console.log(`Ordem ${existingOrder.orderNumber} mudou de status: ${previousStatus} -> COMPLETED -> QTD USDT:${existingOrder.amount}`);
    
              if (orderManager.isRunning) {
                await handleCompletedOrder(existingOrder);
              } else {
                console.log('Compra automática está desligada, a compra não será realizada.');
              }
            }
          }
        }
      }
    
      return statusUpdated;
    }
    
  async function handleCompletedOrder(completedOrder) {
      console.log('Compra automática está ligada, prosseguindo com a compra.');
    
      try {
        const exchangeInfo = await binance.getExchangeInfo();
        const symbolInfo = exchangeInfo.symbols.find(s => s.symbol === 'USDTBRL');
        const lotSizeFilter = symbolInfo.filters.find(f => f.filterType === 'LOT_SIZE');
    
        const { minQty, maxQty, stepSize } = lotSizeFilter;
        let adjustedQuantity = Math.floor(completedOrder.amount / parseFloat(stepSize)) * parseFloat(stepSize);
        adjustedQuantity = Math.max(parseFloat(minQty), Math.min(adjustedQuantity, parseFloat(maxQty)));
    
        const orderBook = await binance.getOrderBook('USDTBRL');
        const price = (parseFloat(orderBook.asks[0][0] - 0.001).toFixed(3));
    
        await binance.placeOrder('BUY', 'USDTBRL', adjustedQuantity.toFixed(2), price);
        console.log('Ordem de compra enviada com sucesso.');
      } catch (error) {
        console.error('Erro ao enviar ordem de compra:', error);
      }
    } 
 
  updateOrdersAndPrices();
  
  ws = new WebSocket('wss://stream.binance.com:9443/ws/usdtbrl@depth');
  
  ws.on('close', () => {
    console.log('WebSocket connection closed. Reconnecting...');
    setTimeout(() => {
      ws = new WebSocket('wss://stream.binance.com:9443/ws/usdtbrl@depth');
    }, 500);
  });
   
  
  app.get('/usdtbrl-transactions', (req, res) => {
    res.sendFile(path.join(__dirname, 'usdtbrl_transactions.html'));
  });
  
  app.get('/usdtbrl-transactions-data-buy', async (req, res) => {
    const { startDate, endDate } = req.query;
    
    try {
      const trades = await binance.getAllTrades('USDTBRL');
      const buyOrders = trades.filter(trade => trade.isBuyer); 
  
      const filteredBuyOrders = buyOrders.filter(order => {
        const orderDate = new Date(order.time);
        if (startDate && endDate) {
          return orderDate >= startDate && orderDate <= endDate;
        } else if (startDate) {
          return orderDate >= startDate;
        } else if (endDate) {
          return orderDate <= endDate;
        } else {
          return true;
        }
      });
  
      res.json({ buyOrders: filteredBuyOrders });
    } catch (error) {
      console.error('Erro ao obter transações de compra de USDTBRL:', error);
      res.status(500).json({ message: 'Erro ao obter transações USDTBRL', error: error.message });
    }
  });
  
  app.get('/usdtbrl-transactions-data-sell', async (req, res) => {
    const { startDate, endDate } = req.query;
    
    try {
      const trades = await binance.getAllTrades('USDTBRL');
      const sellOrders = trades.filter(trade => !trade.isBuyer); 
  
      const filteredSellOrders = sellOrders.filter(order => {
        const orderDate = new Date(order.time);
        if (startDate && endDate) {
          return orderDate >= startDate && orderDate <= endDate;
        } else if (startDate) {
          return orderDate >= startDate;
        } else if (endDate) {
          return orderDate <= endDate;
        } else {
          return true;
        }
      });
  
      res.json({ sellOrders: filteredSellOrders });
    } catch (error) {
      console.error('Erro ao obter transações de venda de USDTBRL:', error);
      res.status(500).json({ message: 'Erro ao obter transações USDTBRL', error: error.message });
    }
  });
  
  app.get('/averagePrice', async (req, res) => {
    const { tradeType, startDate, endDate } = req.query;
  
    if (!tradeType || !startDate || !endDate) {
      return res.status(400).json({ message: 'Parâmetros tradeType, startDate e endDate são obrigatórios.' });
    }
  
    try {
      const client = await pool.connect();
      try {
        const query = `
          SELECT 
            SUM(total_price) / SUM(amount) as average_price,
            SUM(amount) as qtdusdt,
            SUM(total_price) as qtdbrl
          FROM 
            orders
          WHERE 
            trade_type = $1 
          AND order_status = 'COMPLETED' 
          AND create_time BETWEEN $2 AND $3 `;
    
        const values = [tradeType, new Date(startDate), new Date(endDate)];
        
        const result = await client.query(query, values);
    
        const { average_price, qtdusdt, qtdbrl } = result.rows[0];
    
        res.json({
          averagePrice: parseFloat(average_price),
          totalUsdt: parseFloat(qtdusdt),
          totalBrl: parseFloat(qtdbrl)
        });
      } finally {
        client.release();
      }
    } catch (error) {
      console.error('Erro ao calcular o preço médio:', error);
      res.status(500).json({ message: 'Erro ao calcular o preço médio', error: error.message });
    }
  });
  
  app.get('/getOrderList', async (req, res) => {
    const { tradeType, startDate, endDate } = req.query;
  
    if (!tradeType || !startDate || !endDate) {
      return res.status(400).json({ message: 'Parâmetros tradeType, startDate e endDate são obrigatórios.' });
    }
  
    try {
      const client = await pool.connect();
      const query = `
        SELECT * FROM orders
        WHERE trade_type = $1 AND order_status = 'COMPLETED' AND create_time BETWEEN $2 AND $3
        ORDER BY create_time DESC` ;
      const values = [tradeType, new Date(startDate), new Date(endDate)];
      const result = await client.query(query, values);
  
      const orders = result.rows;
      res.json({ data: orders });
    } catch (error) {
      console.error('Erro ao obter a lista de ordens:', error);
      res.status(500).json({ message: 'Erro ao obter a lista de ordens', error: error.message });
    }
  });

  app.post('/releaseCoin', async (req, res) => {
    const { orderNumber } = req.body; 
    if (!orderNumber) {
      return res.status(400).json({ message: 'Parâmetro número da ordem é obrigatório.' });
    }
    try {
      const googleCode = await getBinanceCodeOTP();
      const orderReleased = await binance.releaseTrade(orderNumber,googleCode); 
      console.log('Parâmetros enviados:', { orderNumber, googleCode });    
      res.json(orderReleased);
      
    } catch (error) {
      console.error('Erro ao liberar ordem', error);
      res.status(500).json({ error: 'Erro ao liberar ordem', message: error.message });
    } 
  });

  app.post('/buy_order', async (req, res) => {
    const { price, quantity } = req.body;
    try {
      const result = await binance.placeOrder('BUY', 'USDTBRL', quantity, price);
      res.json(result);
    } catch (error) {
      console.error('Erro ao enviar ordem de compra:', error);
      res.status(500).json({ code: 'ERROR', message: 'Erro ao enviar ordem de compra' });
    }
  });
  
  app.post('/sell_order', async (req, res) => {
    const { price, quantity } = req.body;
    try {
      const result = await binance.placeOrder('SELL', 'USDTBRL', quantity, price);
      res.json(result);
    } catch (error) {
      console.error('Erro ao enviar ordem de venda:', error);
      res.status(500).json({ code: 'ERROR', message: 'Erro ao enviar ordem de venda' });
    }
  });
  
  app.get('/open_orders', async (req, res) => {
    try {
      const openOrders = await binance.getOpenOrders('USDTBRL');
      res.json(openOrders);
    } catch (error) {
      console.error('Erro ao obter ordens em aberto:', error);
      res.status(500).json({ code: 'ERROR', message: 'Erro ao obter ordens em aberto' });
    }
  });
  
  app.delete('/cancel_order', async (req, res) => {
    const { orderId } = req.query;
    try {
      const result = await binance.cancelOrder('USDTBRL', orderId);
      res.json(result);
    } catch (error) {
      console.error('Erro ao cancelar ordem:', error);
      res.status(500).json({ code: 'ERROR', message: 'Erro ao cancelar ordem' });
    }
  });

  app.get('/order_book', async (req, res) => {
    try {
      const orderBook = await binance.getOrderBook('USDTBRL');
      res.json(orderBook);
    } catch (error) {
      console.error('Erro ao obter book de ordens:', error);
      res.status(500).json({ code: 'ERROR', message: 'Erro ao obter book de ordens' });
    }
  });
    
  app.get('/trade', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'trade.html'));
  });
  
  app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
  });
  
async function getTradesApprovedToRelease() {
    return new Promise(async function (fulfill, reject) {
      try {
        console.log("Starting getTradesApprovedToRelease function");
        const token = await getToken();
        const baseUrl = `${process.env.API_INKLUZIVA_PREFIX}/orders/p2p/history`;
        const params = new URLSearchParams({
          'companyIds[]': process.env.API_INKLUZIVA_UUID,
          'orderStatuses[]': 'BUYER_PAYED',
          'statuses[]': 'RECONCILED',
          pageSize: 100,
          pageIndex: 0
        });
        const url = `${baseUrl}?${params.toString()}`;
        //log.general(`Fetching data from URL: ${url}`);
        const responseInkluziva = await fetch(url, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        });
        const responseInkluzivaJson = await responseInkluziva.json();
        const orders = responseInkluzivaJson?.data;
        console.log(`${orders?.length || 0} ordens encontradas`);
  
        if (orders?.length > 0) {
          orders.reverse();
          fulfill(orders.slice(0, 3));
        } else {
          console.log("No orders found.");
          fulfill([]); // Retorna uma lista vazia
        }
      } catch (error) {
        log.error(`Error at inkluziva.getTradesApprovedToRelease: ${error}`);
        reject(error);
      }
    });
  }

async function getBinanceCodeEmail() {
    return new Promise(async function (fulfill, reject) {
      console.log(`Buscando codigo de confirmação no email`);
      var ret;
      try {
        process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
        const imap = new ImapClient(process.env.EMAIL_HOST, parseInt(process.env.EMAIL_PORT), {
          auth: {
            user: process.env.EMAIL_USERNAME,
            pass: process.env.EMAIL_PASSWORD,
          },
          ignoreTLS: true,
          logLevel: "error",
        });
        await imap.connect();
        const box = await imap.selectMailbox("INBOX");
        for (var tentativa = 1; tentativa <= 3; tentativa++) {
          if (tentativa > 1) {
            console.log("- Aguardando 10s");
            await new Promise((resolve) => setTimeout(resolve, 10000));
          }
          console.log(`- Tentativa ${tentativa}/3`);
          const messages = await imap.listMessages("INBOX", `${box.uidNext - 10}:${box.uidNext}`, ["flags", "body.peek[]"], { byUid: true });
          for (var m = messages.length - 1; m >= 0; m--) {
            var body = messages[m]["body[]"];
            if (messages[m].flags.length == 1 && body.indexOf("[Binance] Release P2P Payment") >= 0) {
              const m64 = body.split("MIME-Version: 1.0");
              const msg = Buffer.from(m64[1].trim(), "base64").toString();
              const matches = msg.match(/\d{6}<\/span>/g);
              if (matches.length >= 0) {
                ret = matches[0].split("</span>")[0].trim();
                await imap.setFlags("INBOX", `${messages[m].uid}`, { set: ["\\Seen"] }, { byUid: true });
                break;
              }
            }
          }
          if (ret) {
            break;
          }
        }
        await imap.close();
      } catch (error) {
        console.error(error);
        reject(error);
        return;
      }
      if (ret) {
        console.log(ret);
        fulfill(ret);
      } else {
        reject("Not found");
      }
    });
  }
  
function getBinanceCodeOTP() {
    return new Promise(async function (fulfill, reject) {
      console.log(`Buscando codigo OTP`); // Alterado de log.general para console.log
      const sec = new Date().getSeconds();
      if ((sec > 25 && sec <= 29) || (sec > 55 && sec <= 59)) {
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
      var ret;
      try {
        let totp = new OTPAuth.TOTP({
          issuer: "Binance.com",
          label: "Binance",
          algorithm: "SHA1",
          digits: 6,
          secret: process.env.TOTP_SECRET,
        });
        ret = totp.generate();
      } catch (error) {
        reject(error);
      }
      if (ret) {
        console.log(ret); // Alterado de log.general para console.log
        fulfill(ret);
      } else {
        reject("Not found");
      }
    });
  }



// Inicia o monitoramento de ordens assim que o servidor é iniciado
//orderManager.start().catch(error => {
//  console.error('Erro ao iniciar o monitoramento de ordens:', error);
//});

// Configurar eventos do OrderManager
orderManager.on('ordersProcessed', (orders) => {
  console.log('Ordens processadas:', orders.orderId);
});

orderManager.on('orderAdjusted', ({ oldOrderId, newOrder }) => {
  console.log(`Ordem ${oldOrderId} ajustada para nova ordem:`, newOrder);
});

orderManager.on('orderRemoved', (orderId) => {
  console.log('Ordem removida:', orderId);
});

// Rota para verificar o status do gerenciamento de ordens
app.get('/order_management_status', (req, res) => {
  res.json({ status: orderManager.isRunning ? 'running' : 'stopped' });
});

app.post('/stop_order_management', (req, res) => {
  orderManager.stop();
  res.json({ message: 'Gerenciamento de ordens parado', status: 'stopped' });
});

app.post('/start_order_management', (req, res) => {
  orderManager.start().catch(error => {
      console.error('Erro ao iniciar o gerenciamento de ordens:', error);
  });
  res.json({ message: 'Gerenciamento de ordens iniciado', status: 'running' });
});


async function getToken() {
  return new Promise(async function (fulfill, reject) {
    try {
      //log.general(`Autenticando API`);
      const responseInkluziva = await fetch(`${process.env.API_INKLUZIVA_PREFIX}/auth`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: process.env.API_INKLUZIVA_EMAIL,
          password: process.env.API_INKLUZIVA_SENHA,
        }),
      });
      const responseInkluzivaJson = await responseInkluziva.json();
      if (responseInkluzivaJson.token) {
        fulfill(responseInkluzivaJson.token);
      } else {
        reject(responseInkluzivaJson.message);
      }
    } catch (error) {
      reject(error);
    }
  });
}


async function run() {
  log.general("Starting bot");
  setInterval(async () => {
    try {
      // Add any periodic tasks here
    } catch (error) {
      log.error(`Error in periodic task: ${error.message}`);
    }
  }, 5 * 1000);
  await monitorP2PPayment();
}

async function monitorP2PPayment() {
  log.general("Starting monitorP2PPayment function");
  try {
    log.general("Calling getTradesApprovedToRelease");
    let orders;
    try {
      orders = await getTradesApprovedToRelease();
    } catch (error) {
      log.error(`Error calling getTradesApprovedToRelease: ${error ? (error.message || error) : 'Unknown error'}`, error);
      return;
    }
    log.general(`Retrieved orders to release: ${orders.length}`);

    for (const o of orders) {
      try {
        log.general(`Processing order: ${o.orderNumber}`);

        const currentOrders = await BinanceService.getOrderMatchListByMerchant();
               
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
    log.error(`Error at monitorP2PPayment: ${error ? (error.message || error) : 'Unknown error'}`, error);
  }
  await new Promise((resolve) => setTimeout(resolve, 10000));
  log.general("Restarting monitorP2PPayment function");
  await monitorP2PPayment();
}

async function releaseP2PPayment(orderNumber) {
  return new Promise(async function (fulfill, reject) {
    try {
      log.general(`Liberando pagamento ordem ${orderNumber}`);
      const bizNo = await BinanceService.confirmOrderPayed(orderNumber);
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const steps = await BinanceService.getSteps(bizNo);
      await new Promise((resolve) => setTimeout(resolve, 1500));
      if (steps.challengeSteps[0].stepList.indexOf("EMAIL") >= 0) {
        await BinanceService.sendEmailVerifyCode(bizNo);
        await new Promise((resolve) => setTimeout(resolve, 15000));
        const emailCode = await getBinanceCodeEmail();
        await BinanceService.verifySingleFactor(bizNo, "EMAIL", emailCode);
      }
      if (steps.challengeSteps[0].stepList.indexOf("GOOGLE") >= 0) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        const googleCode = await getBinanceCodeOTP();
        await BinanceService.verifySingleFactor(bizNo, "GOOGLE", googleCode);
      }
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const challengeToken = await BinanceService.getChallengeToken(bizNo);
      await new Promise((resolve) => setTimeout(resolve, 1500));
      await BinanceService.confirmOrderPayed(orderNumber, bizNo, challengeToken);
      log.general(`Ordem ${orderNumber} liberada com sucesso`);
      fulfill();
    } catch (error) {
      log.error(`Error at releaseP2PPayment: ${error}`);
      reject(error);
    }
  });
}

 //Start the bot
run();


app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
    //console.log('Monitoramento de ordens iniciado automaticamente');
  });


  exports.getTradesApprovedToRelease = getTradesApprovedToRelease;
  exports.getBinanceCodeEmail = getBinanceCodeEmail;
  exports.getBinanceCodeOTP = getBinanceCodeOTP;