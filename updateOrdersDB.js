const pool = require('./db');
const fs = require('fs');
const path = require('path');

async function insertOrUpdateOrder(order) {
  const client = await pool.connect();
  try {
    await client.query(`
      INSERT INTO orders (order_number, create_time, asset, unit_price, amount, total_price, trade_type, order_status, counterPartNickName)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (order_number) DO UPDATE SET
        create_time = EXCLUDED.create_time,
        asset = EXCLUDED.asset,
        unit_price = EXCLUDED.unit_price,
        amount = EXCLUDED.amount,
        total_price = EXCLUDED.total_price,
        trade_type = EXCLUDED.trade_type,
        order_status = EXCLUDED.order_status,
        counterPartNickName = EXCLUDED.counterPartNickName
    `, [
      order.orderNumber,
      new Date(order.createTime),
      order.asset,
      order.unitPrice,
      order.amount,
      order.totalPrice,
      order.tradeType,
      order.orderStatus,
      order.counterPartNickName
    ]);
  } catch (err) {
    console.error('Erro ao inserir ou atualizar ordem:', err);
  } finally {
    client.release();
  }
}

async function getOrderFromDatabase(orderNumber) {
  const client = await pool.connect();
  try {
    const res = await client.query('SELECT * FROM orders WHERE order_number = $1', [orderNumber]);
    return res.rows[0];
  } catch (err) {
    console.error('Erro ao buscar ordem no banco de dados:', err);
  } finally {
    client.release();
  }
  return null;
}

async function updateOrdersFromJson() {
  const ordersPath = path.join(__dirname, '/public/orders.json');
  if (!fs.existsSync(ordersPath)) {
    console.log('Arquivo orders.json não encontrado');
    return;
  }

  const data = fs.readFileSync(ordersPath);
  const orders = JSON.parse(data);

  for (const order of orders.data) {
    const dbOrder = await getOrderFromDatabase(order.orderNumber);
    if (!dbOrder || hasOrderChanged(dbOrder, order)) {
      await insertOrUpdateOrder(order);
    }
  }
}

function hasOrderChanged(dbOrder, jsonOrder) {
  return (
    dbOrder.create_time.getTime() !== new Date(jsonOrder.createTime).getTime() ||
    dbOrder.asset !== jsonOrder.asset ||
    dbOrder.unit_price !== jsonOrder.unitPrice ||
    dbOrder.amount !== jsonOrder.amount ||
    dbOrder.total_price !== jsonOrder.totalPrice ||
    dbOrder.trade_type !== jsonOrder.tradeType ||
    dbOrder.order_status !== jsonOrder.orderStatus ||
    dbOrder.counterPartNickName !== jsonOrder.counterPartNickName
  );
}

// Exporta a função para ser usada em outros arquivos
module.exports = updateOrdersFromJson;
