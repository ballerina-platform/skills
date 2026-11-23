# Ballerina Langlib Reference

## Contents
- [Type Conversion](#type-conversion)
- [JSON Conversion](#json-conversion)
- [Arrays](#arrays)
- [Strings](#strings)
- [Maps](#maps)
- [Numbers](#numbers)
- [Errors](#errors)
- [Sleep](#sleep)
- [Query Expressions](#query-expressions)
- [XML](#xml)
- [Regular Expressions](#regular-expressions)

---

## Type Conversion

```ballerina
int age = check int:fromString("25");
float price = check float:fromString("19.99");
decimal exact = check decimal:fromString("10.50");
boolean flag = check boolean:fromString("true");
xml bookXml = check xml:fromString("<book>Hamlet</book>");

// Special float values
float notANumber = check float:fromString("NaN");
float infinity = check float:fromString("Infinity");
```

---

## JSON Conversion

```ballerina
// Parse JSON string
json data = check jsonText.fromJsonString();

// JSON string → typed array
int[] nums = check jsonArray.fromJsonStringWithType();

// JSON string → record
type Config record {| int port; int timeout; |};
Config cfg = check configText.fromJsonStringWithType(Config);

// Record → JSON
json result = person.toJson();
string jsonStr = person.toJsonString();

// json → record (cloneWithType)
json raw = {port: 8080};
Config config = check raw.cloneWithType();

// Validate field type (ensureType)
json[] subjects = check student.subjects.ensureType();

// Clone a value
int[] copy = original.clone();
```

---

## Arrays

```ballerina
numbers.length()        // count
numbers.push(4)         // append
numbers.pop()           // remove last, returns it
numbers.unshift(0)      // prepend
numbers.shift()         // remove first, returns it
numbers.indexOf(30)     // int? — index or ()
numbers.sort()          // ascending
numbers.sort("descending")
```

---

## Strings

```ballerina
text.length()
text.substring(0, 5)
text.indexOf("World")           // int? — index or ()
text.includes("World")          // boolean
text.includes("o", 5)           // search from index
text.startsWith("Hello")
text.endsWith("World")
text.trim()
text.toUpperAscii()
text.toLowerAscii()
text.equalsIgnoreCaseAscii(str2 = "hello world") // boolean, ASCII letters only
text.toBytes()                  // byte[]
string:fromBytes(data)          // check — byte[] → string
string:'join(", ", "a", "b")    // "a, b"
"Hello".concat(" ", "World")

// Code points
int code = string:toCodePointInt("A");           // 65
string char = check string:fromCodePointInt(65); // "A"
int[] codes = "Hello".toCodePointInts();
string text = check string:fromCodePointInts([72, 101, 108, 108, 111]);
int code = "Hello".getCodePoint(0);              // 72
```

---

## Maps

```ballerina
scores.length()
scores.get("Alice")             // panics if missing
scores.hasKey("Alice")          // boolean
scores.keys()                   // string[]
scores.toArray()                // value[]
scores.remove("Alice")          // returns value, panics if missing
scores.removeIfHasKey("Carol")  // returns value? — safe remove
scores.removeAll()
```

---

## Numbers

```ballerina
(255).toHexString()             // "ff"
int value = check int:fromHexString("ff"); // 255
```

---

## Errors

```ballerina
err.message()                   // string
err.detail()                    // map<value:Cloneable> & readonly
err.cause()                     // error?
```

---

## Sleep

```ballerina
import ballerina/lang.runtime;
runtime:sleep(2); // pause for 2 seconds
```

---

## Query Expressions

```ballerina
// Filter array
int[] even = from int n in numbers where n % 2 == 0 select n;

// Transform records
string[] names = from var p in people where p.age > 23 select p.name;

// Process stream
int[] filtered = from int num in numberStream where num > 2 select num;
```

---

## XML

```ballerina
xml element = xml `<book><title>Hamlet</title></book>`;
xml books = xml `<book>Book1</book>` + xml `<book>Book2</book>`;
xml combined = xml:concat(xml `<item>First</item>`, xml `<item>Second</item>`);
xml parsed = check xml:fromString(xmlText);
int count = items.length();

// For XML ↔ record conversion, use ballerina/data.xmldata
```

---

## Regular Expressions

Must import: `import ballerina/lang.regexp;`

```ballerina
// Create pattern
string:RegExp pattern = re `[0-9]+`;
string:RegExp pattern = check regexp:fromString("[0-9]+");

// Find
regexp:Span? match = pattern.find("Hello123");
regexp:Span[] all = re `[0-9]+`.findAll("a1b2c3");

// Capture groups
regexp:Groups? groups = re `([a-z]+)([0-9]+)`.findGroups("abc123");
if groups is regexp:Groups {
    string full = groups[0].substring();   // "abc123"
    string letters = groups[1].substring(); // "abc"
    string numbers = groups[2].substring(); // "123"
}

// Validate full match
boolean valid = re `[0-9]+`.isFullMatch("123");

// Replace
string result = re `[0-9]+`.replace("a1b2", "X");      // "aXb2"
string result = re `[0-9]+`.replaceAll("a1b2", "X");   // "aXbX"

// Split
string[] parts = re `,\s*`.split("a, b, c"); // ["a", "b", "c"]
```
