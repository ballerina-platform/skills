# Number Rules

Read when rounding or formatting amounts.

- `decimal`'s `round(n)` rounds half-even (`2.5d.round(0)` is `2`). As of 2201.14 it also doesn't pad (`1.1d.round(4)`
  prints `1.1`, lang#44920), and `toString()` can print `1E+3` or `0`.
- For half-up rounding printed with a fixed number of digits (Java's `setScale(n, RoundingMode.HALF_UP)`):

```ballerina
function toFixed(decimal value, int places) returns string {
    decimal scale = 1;
    foreach int _ in 0 ..< places {
        scale *= 10;
    }
    int units = <int>(value.abs() * scale + 0.5d).floor();   // panics past int range (|value| x 10^places >= 9.2E18)
    string digits = units.toString().padZero(places + 1);
    int point = digits.length() - places;
    string text = places == 0 ? digits : digits.substring(0, point) + "." + digits.substring(point);
    return value < 0d && units != 0 ? "-" + text : text;
}
// toFixed(12.5000005d, 6) "12.500001"   toFixed(999.995d, 2) "1000.00"   toFixed(0d, 2) "0.00"   toFixed(-2.5d, 0) "-3"
```
