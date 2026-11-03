// Test file for checking the Claude PR reviewer. Not used by the site.
// Contains a deliberate bug: the loop skips the last item.
function sumPrices(items) {
  let total = 0;
  for (let i = 0; i < items.length - 1; i++) {
    total += items[i].price;
  }
  return total;
}

module.exports = { sumPrices };
