const axios = require('axios');
const crypto = require('crypto');
const querystring = require('querystring');



class BinanceAPI {
  constructor(apiKey, apiSecret) {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
    this.baseUrl = 'https://api.binance.com';
  }

  async getServerTime() {
    const url = `${this.baseUrl}/api/v3/time`;
    const response = await axios.get(url);
    return response.data.serverTime;
  }

  createSignature(params) {
    const query_string = Object.keys(params)
      .map(key => `${key}=${params[key]}`)
      .join('&');
    return crypto
      .createHmac('sha256', this.apiSecret)
      .update(query_string)
      .digest('hex');
  }


  async sendSignedRequest(httpMethod, urlPath, payload = {}) {
    const timestamp = await this.getServerTime();
    payload.timestamp = timestamp;

    const queryString = querystring.stringify(payload);
    const signature = this.createSignature(payload);

    const url = `${this.baseUrl}${urlPath}?${queryString}&signature=${signature}`;

    const headers = {
      'X-MBX-APIKEY': this.apiKey,
      'Content-Type': 'application/json',
    };

    try {
      const response = await axios({
        method: httpMethod,
        url: url,
        headers: headers,
      });
      return response.data;
    } catch (error) {
      console.error('Request error:', error.response ? error.response.data : error.message);
      throw error;
    }
  }
  
  async makeRequest(method, endpoint, params = {}, bodyParams = null) {
    const url = `${this.baseUrl}${endpoint}`;
    const serverTime = await this.getServerTime();
    params.timestamp = serverTime;
    params.signature = this.createSignature(params);

    const headers = {
      'X-MBX-APIKEY': this.apiKey,
      'Content-Type': 'application/json',
    };

    try {
      let response;
      if (method === 'GET') {
        response = await axios.get(url, { headers, params });
      } else if (method === 'POST') {
        response = await axios.post(url, bodyParams, { headers, params });
      }
      return response.data;
    } catch (error) {
      console.error('Request error:', error.response ? error.response.data : error.message);
      throw error;
    }
  }


  async getExchangeInfo() {
    const url = `${this.baseUrl}/api/v3/exchangeInfo`;
    const response = await axios.get(url);
    return response.data;
  }

  async getAdDetails(adNum) {
    return this.makeRequest('POST', '/sapi/v1/c2c/ads/getDetailByNo', { adsNo: adNum });
  }

  async getMessages(orderNumber, page = 1, rows = 10) {
    return this.makeRequest('GET', '/sapi/v1/c2c/chat/retrieveChatMessagesWithPagination', {
      page,
      rows,
      orderNo: orderNumber,
/*       Get chat messages related to a specific order.

      Args:
          order_number (str): Order number.
          page (int, optional): Page number. Defaults to 1.
          rows (int, optional): Number of rows per page. Defaults to 10.
      Returns:
          dict: Chat messages. */     

    });
  }

  async retrieveChatCredentials(clientType = 'web') {
    return this.makeRequest('GET', '/sapi/v1/c2c/chat/retrieveChatCredential', {
      clientType,
 /*      Retrieve chat credentials for connecting to the chat WebSocket.

      Args:
          client_type (str, optional): Client type. Defaults to 'web'.

      Returns:
          dict: Chat credentials. 
          
      How to get notifications of orders or chat?

      It can be found In the response of this API

      /sapi/v1/c2c/chat/retrieveChatCredential
      Then, get the wss url and the credential as following

      {
      ""code"": ""000000"",
      ""message"": ""success"",
      ""data"": {
        ""chatWssUrl"": ""wss://im.binance.com:443/chat"",
        ""listenKey"": ""c2c_xxxxxxxxxxxxxx"",
        ""listenToken"": ""TOKENxxxxxxxxx""
      },
        ""success"": true
      }
      Next, you should connect to wss by

      wss://im.binance.com:443/chat/c2c_xxxxxxxxxxxxxx?token=TOKENxxxxxxxxx&clientType=web     
      */

    });
  }

  async getOrderList(tradeType, page = 1, rows = 100) {

    const timestamp = Date.now();
    const query = `tradeType=${tradeType}&page=${page}&rows=${rows}&timestamp=${timestamp}`;
    const signature = crypto.createHmac('sha256', this.apiSecret).update(query).digest('hex');
    const url = `${this.baseUrl}/sapi/v1/c2c/orderMatch/listUserOrderHistory?${query}&signature=${signature}`;
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-MBX-APIKEY': this.apiKey,
      },
    });
  
    if (!response.ok) {
      throw new Error(`Request error: ${response.statusText}`);
    }
  
    const orders  = await response.json();
      
    return orders;
  
  }
  
  async getAdsList(page = 1, rows = 100) {
    return this.makeRequest('POST', '/sapi/v1/c2c/ads/listWithPagination', {}, { page, rows });
  }

  async updatePrice(advNo, price) {
    return this.makeRequest('POST', '/sapi/v1/c2c/ads/update', {}, { advNo, price });
  }

  async updateAdsStatus(advNo, advStatus) {
    try {
      console.log(`Updating ad status to ${advStatus} for advNo: ${advNo}`);
      const result = await this.makeRequest('POST', '/sapi/v1/c2c/ads/update', {}, { advNo, advStatus });
      //console.log('Update result:', result);
      return result;
    } catch (error) {
      console.error('Error in updateAdsStatus:', error.response ? error.response.data : error.message);
      throw error;
    }
  }
  
  async updateAd(advNo, updates) {
    updates.advNo = advNo;
    return this.makeRequest('POST', '/sapi/v1/c2c/ads/update', {}, updates);
  }
      
  async topUpAdBalance(advNo, topUpAmount) {
    const adDetails = await this.getAdDetails(advNo);
    const currentBalance = parseFloat(adDetails.data.initAmount || 0); // Corrigido aqui
    const newBalance = currentBalance + topUpAmount;
  return this.updateAd(advNo, { initAmount: newBalance });
}

  async searchAds(asset, fiat, tradeType, page = 1, rows = 20, filterType = 'all') {
    return this.makeRequest('POST', '/sapi/v1/c2c/ads/search', {}, {
      page,
      rows,
      asset,
      fiat,
      tradeType,
      filterType,
    });
  }

  async getAds(asset, fiat, tradeType) {
    const ads = [];
    for (let i = 1; i <= 2; i++) {
      const result = await this.searchAds(asset, fiat, tradeType, i, 20, 'all');
      ads.push(...result);
    }
    return ads;
  }

  async getOrderDetails(orderNumber) {
    return this.makeRequest('POST', '/sapi/v1/c2c/orderMatch/getUserOrderDetail', {}, { adOrderNo: orderNumber });

  /*   Get details of a specific order.

    Args:
        order_number (str): Order number.

    Returns:
        dict: Order details. */

  }

  async releaseTrade(orderNumber,googleCode) {
 
    console.log('Iniciando releaseTrade com os seguintes parâmetros:');
    console.log('orderNumber:', orderNumber);
    console.log('googleCode:', googleCode);
  
    try {
      const response = await this.makeRequest('POST', '/sapi/v1/c2c/orderMatch/releaseCoin', {}, {
        orderNumber,
        authType: 'GOOGLE_CODE',
        googleVerifyCode: googleCode,
      });
      //https://c2c-admin.binance.com/bapi/c2c/v1/private/c2c/order-match/confirm-order-payed
      console.log('Resposta da API:', JSON.stringify(response, null, 2));
  
      if (response.status === 'ERROR') {
        throw new Error(`Erro na API: ${response.errorData}`);
      }
  
      return response;
    } catch (error) {
      console.error('Erro ao fazer a requisição:', error.message);
      
      if (error.response) {
        console.error('Detalhes da resposta de erro:');
        console.error('Status:', error.response.status);
        console.error('Dados:', JSON.stringify(error.response.data, null, 2));
      }
  
      throw error;
    }
  }

  async getSpotWalletBalance() {
    return this.makeRequest('GET', '/api/v3/account');
  }

  async getFundingWalletBalance(asset = 'USDT') {
    return this.makeRequest('POST', '/sapi/v1/asset/get-funding-asset', {}, { type: 'SPOT', asset });
  }

  async transferFromSpotToFunding(asset, amount) {
    return this.transferBetweenWallets(asset, 'MAIN_FUNDING', amount);
  }

  async transferBetweenWallets(asset, type, amount) {
    const params = {
      type,
      asset,
      amount,
    };
    return this.makeRequest('POST', '/sapi/v1/asset/transfer', params);
  }

  async getAllTrades(symbol) {
    const params = {
      symbol
    };
    return this.makeRequest('GET', '/api/v3/myTrades', params);
  }

  async placeOrder(side, symbol, quantity, price) {
    const endpoint = '/api/v3/order';
    const params = {
      symbol,
      side,
      type: 'LIMIT',
      timeInForce: 'GTC',
      quantity,
      price
    };
    return this.sendSignedRequest('POST', endpoint, params);
  }  

  async getTickerPrice(symbol) {
    const endpoint = '/api/v3/ticker/price';
    const params = { symbol };
    const response = await axios.get(`${this.baseUrl}${endpoint}`, { params });
    return response.data;
  }

  async getOpenOrders(symbol) {
    const endpoint = '/api/v3/openOrders';
    const params = { symbol };
    return this.sendSignedRequest('GET', endpoint, params);
  }

  async getAllOrders(symbol) {
    const endpoint = '/api/v3/allOrders';
    const params = { symbol };
    return this.sendSignedRequest('GET', endpoint, params);
  }

  async cancelOrder(symbol, orderId) {
    const endpoint = '/api/v3/order';
    const params = { symbol, orderId };
    return this.sendSignedRequest('DELETE', endpoint, params);
  }

  async getOrderBook(symbol) {
    const endpoint = '/api/v3/depth';
    const params = { symbol, limit: 10 };  // Ajuste o limite conforme necessário
    const response = await axios.get(`${this.baseUrl}${endpoint}`, { params });
    return response.data;
  }

}

module.exports = BinanceAPI;

