const WebSocket = require('ws');
const axios = require('axios');

const binanceWs = new WebSocket('wss://stream.binance.com:9443/ws');
const streamName = 'usdtbrl@depth'; // Substitua por qualquer par de negociação desejado
let localOrderBook = { asks: [], bids: [] };

// Função para obter a snapshot inicial do livro de ordens
async function getOrderBookSnapshot() {
    const response = await axios.get('https://api.binance.com/api/v3/depth', {
        params: {
            symbol: 'USDTBRL', // Substitua pelo par de negociação desejado
            limit: 1000
        }
    });
    localOrderBook = response.data;
    console.log('Snapshot obtida:', localOrderBook);
}

// Função para atualizar o livro de ordens local com os dados do WebSocket
function updateLocalOrderBook(update) {
    update.bids.forEach(bid => {
        const index = localOrderBook.bids.findIndex(item => item[0] === bid[0]);
        if (index !== -1) {
            if (bid[1] === '0.00000000') {
                localOrderBook.bids.splice(index, 1);
            } else {
                localOrderBook.bids[index][1] = bid[1];
            }
        } else {
            localOrderBook.bids.push(bid);
        }
    });

    update.asks.forEach(ask => {
        const index = localOrderBook.asks.findIndex(item => item[0] === ask[0]);
        if (index !== -1) {
            if (ask[1] === '0.00000000') {
                localOrderBook.asks.splice(index, 1);
            } else {
                localOrderBook.asks[index][1] = ask[1];
            }
        } else {
            localOrderBook.asks.push(ask);
        }
    });

    localOrderBook.bids.sort((a, b) => parseFloat(b[0]) - parseFloat(a[0]));
    localOrderBook.asks.sort((a, b) => parseFloat(a[0]) - parseFloat(b[0]));
}

// Inicializa a snapshot do livro de ordens
getOrderBookSnapshot().then(() => {
    // Conecta ao WebSocket após obter a snapshot inicial
    binanceWs.on('open', () => {
        console.log('Conectado ao WebSocket da Binance');
        binanceWs.send(JSON.stringify({
            method: 'SUBSCRIBE',
            params: [streamName],
            id: 1
        }));
    });

    binanceWs.on('message', (message) => {
        const data = JSON.parse(message);
        if (data.e && data.e === 'depthUpdate') {
            updateLocalOrderBook(data);
            return (localOrderBook.asks[0]);
        }
    });

    binanceWs.on('error', (error) => {
        console.error('Erro no WebSocket:', error);
    });

    binanceWs.on('close', () => {
        console.log('WebSocket desconectado');
    });
});
