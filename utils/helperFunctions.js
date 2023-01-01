const asc = (arr) => arr.sort((a, b) => a - b) // sort array ascending
const sum = (arr) => arr.reduce((a, b) => a + b, 0) // sum the elements of the array
const mean = (arr) => Math.round(sum(arr) / arr.length) // gets the mean

// median = q50
// calculates the percentiles of the values of an array
const quantile = (arr, q) => {
    const sorted = asc(arr)
    const pos = (sorted.length - 1) * q
    const base = Math.floor(pos)
    const rest = pos - base
    if (sorted[base + 1] !== undefined) {
        return sorted[base] + rest * (sorted[base + 1] - sorted[base])
    } else {
        return sorted[base]
    }
}

module.exports = {
    quantile,
    mean,
    sum,
}
