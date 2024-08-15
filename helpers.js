export function calculatePosition(price, p2pData) {
    return p2pData.findIndex(item => parseFloat(item.adv.price) > price) + 1;
  }

export function followCompetitor(adValue, minimumValue, p2pData) {
    const targetNickName = document.getElementById('targetNickName').value.trim();
    let adjustedValue = adValue;
    let position = 1;
    let targetFound = false;
  
    for (const item of p2pData) {
      if (item.advertiser.nickName === targetNickName) {
        adjustedValue = Math.max(parseFloat(item.adv.price) - 0.001, minimumValue);
        targetFound = true;
        break;
      }
      if (parseFloat(item.adv.price) > adValue && !targetFound) {
        adjustedValue = Math.min(parseFloat(item.adv.price) - 0.001, Math.max(adjustedValue, minimumValue));
        break;
      }
      position++;
    }
  
    return { adjustedValue, position };
  }
  
  export function maintainPosition(minimumValue, p2pData) {
    const desiredPosition = parseInt(document.getElementById('desiredPosition').value);
    let adjustedValue, position;
  
    if (p2pData.length >= desiredPosition) {
      const targetPrice = parseFloat(p2pData[desiredPosition - 1].adv.price);
      adjustedValue = Math.max(targetPrice + 0.001, minimumValue);
      position = desiredPosition;
    } else {
      const lastPrice = parseFloat(p2pData[p2pData.length - 1].adv.price);
      adjustedValue = Math.max(lastPrice + 0.001, minimumValue);
      position = p2pData.length + 1;
    }
    return { adjustedValue, position };
  }

  module.exports = {
    calculatePosition,
    followCompetitor,
    maintainPosition
  };