var loadedTriples = {"left":null, "right":null};
var version;
var byObject = false;
var compareMode = false;

$('#versions button').click(function() {
    versionButtonClicked($(this));
});

initializeSwitches();
clickLastVersion();

/**
 * Sets a new version after a version button has been clicked
 * @param button
 */
function versionButtonClicked(button) {
    button.addClass('active').siblings().removeClass('active');
    version = button.attr("value");
    getTriples(version, "right");
    if(compareMode)
        enablePredecessor();
}

/**
 * Loads triples for the given entity and version from the server, parses them and triggers the table rendering
 * @param version
 * @param attribute     the index within loadedTriples to store the triples
 */
function getTriples(version, attribute) {
    loadedTriples[attribute] = null;
    var path = window.location.pathname + "/" + version + "/plain";
    $.get( path, function( data ) {
        var triples = parser.parse(data);
        postprocessParsedTriples(triples);
        loadedTriples[attribute] = triples;
        updateView();
    } );
}

/**
 * Visits each node of the given object and modifies information after peg.js parsing
 * 1. Prefix and suffix to the full URI are written to attribute "plain".
 * 2. If the object is a RDF literal, the escaped quotation marks are unescaped
 * @param object
 */
function postprocessParsedTriples(object) {
    if( typeof object == "object" ) {
        if(typeof object.prefix !== "undefined")
            object.plain = prefixes[object.prefix] + object.suffix;
        if(object.node === "literal")
            object.plain = object.plain.replace(/\\,"/g, '"');
        $.each(object, function(k,v) {
            postprocessParsedTriples(v);
        });
    }
}

/**
 * Groups parsed triples by predicate or by object
 *
 * @param triples   triples in form of [{predicate:..., object:...}, {predicate:..., object:...}, ...]
 * @param byObject  if true, group per object, otherwise by predicate
 * @returns {Array} of form [{key:..., values:[...]}, {key:..., values:[...]}, ...].
 */
function groupTriples(triples, byObject) {
    //the view should be groupable by predicate or by object. Therefore, the mapping which is created here has either predicate or object as key.
    //to simplify comparisons of two versions, for each of the versions all keys and their respective values are sorted alphabetically

    //maps from plain group key (IRI or plain literal) to an extended version (e.g. with prefix or language)
    var expandedGroupKeys = {};
    //maps from plain group key to arrays of all group members (e.g. from dbp:label to an array of labels)
    var groupValues = {};

    for (var i=0; i<triples.length ; i++) {
        var key, value;
        if (byObject) {
            key = triples[i].object;
            value = triples[i].predicate;
        }
        else {
            key = triples[i].predicate;
            value = triples[i].object;
        }
        //add group entries to each group
        expandedGroupKeys[key.plain] = key;
        if(groupValues[key.plain] === undefined) {
            groupValues[key.plain] = [];
        }
        groupValues[key.plain].push(value);
    }
    //collect into a list in form of [{key:..., values:[...]}, {key:..., values:[...]}, ...]
    var groups = [];
    for (var plainKey in expandedGroupKeys) {
        if (expandedGroupKeys.hasOwnProperty(plainKey)) {
            var group = {};
            group.key = expandedGroupKeys[plainKey];
            group.values = _.sortBy(groupValues[plainKey], 'plain');
            groups.push(group);
        }
    }
    groups = _.sortBy(groups, function(group){return group.key.plain});

    return groups;
}

/**
 * Compares two grouped collections of triples as returned by groupTriples into one list
 * Returns for each predicate the objects on the left and right side, common attributes of both sides first
 * @param leftTriplesGrouped
 * @param rightTriplesGrouped
 * @returns {Array}
 */
function compareGroups(leftTriplesGrouped, rightTriplesGrouped) {
    var leftPos = 0;
    var rightPos = 0;
    var leftLength = leftTriplesGrouped.length;
    var rightLength = rightTriplesGrouped.length;
    var result = [];
    var leftGroup, leftKeyPlain, rightGroup, rightKeyPlain;

    //the ordered lists for the old and new version are traversed synchronously
    while(leftPos < leftLength && rightPos < rightLength) {
        leftGroup = leftTriplesGrouped[leftPos];
        leftKeyPlain = leftGroup.key.plain;
        rightGroup = rightTriplesGrouped[rightPos];
        rightKeyPlain = rightGroup.key.plain;

        if(leftKeyPlain === rightKeyPlain) {
            addCommonGroup();
        }
        else if (leftKeyPlain < rightKeyPlain) {
            addGroupLeft();
        }
        else { //leftKeyPlain > rightKeyPlain
            addGroupRight();
        }
    }
    while(leftPos < leftLength) {
        leftGroup = leftTriplesGrouped[leftPos];
        addGroupLeft();
    }
    while(rightPos < rightLength) {
        rightGroup = rightTriplesGrouped[rightPos];
        addGroupRight();
    }

    return result;

    function addCommonGroup() {
        result.push(mergeGroupValues(leftGroup.values, rightGroup.values, leftGroup.key));
        leftPos++;
        rightPos++;
    }

    function addGroupLeft() {
        result.push(mergeGroupValues(leftGroup.values, [], leftGroup.key));
        leftPos++;
    }

    function addGroupRight() {
        result.push(mergeGroupValues([], rightGroup.values, rightGroup.key));
        rightPos++;
    }

    //merges the values for two groups of the same key, indicating on which of the two sides the value is present
    function mergeGroupValues(leftValues, rightValues, key) {
        var leftValuePos = 0;
        var rightValuePos = 0;
        var leftValueNumber = leftValues.length;
        var rightValueNumber = rightValues.length;

        var group = {"left":[], "right":[], "key":key};
        var leftOnlyValues = [];
        var rightOnlyValues = [];
        var leftValue, leftValuePlain, rightValue, rightValuePlain;

        //parallel iteration of left and right sorted values for the key, merging into one list which is sorted as well
        while(leftValuePos < leftValueNumber && rightValuePos < rightValueNumber) {
            leftValue = leftValues[leftValuePos];
            leftValuePlain = leftValue.plain;
            rightValue = rightValues[rightValuePos];
            rightValuePlain = rightValue.plain;

            if(leftValuePlain === rightValuePlain) {
                addCommonValue();
            }
            else if (leftValuePlain < rightValuePlain) {
                addValueLeft();
            }
            else { //leftValuePlain > rightValuePlain
                addValueRight();
            }
        }
        while(leftValuePos < leftValueNumber) {
            leftValue = leftValues[leftValuePos];
            addValueLeft();
        }
        while(rightValuePos < rightValueNumber) {
            rightValue = rightValues[rightValuePos];
            addValueRight();
        }
        group.left = group.left.concat(leftOnlyValues);
        group.right = group.right.concat(rightOnlyValues);
        return group;

        function addCommonValue() {
            leftValue.unequal = rightValue.unequal = false;
            group.left.push(leftValue);
            group.right.push(rightValue);
            leftValuePos++;
            rightValuePos++;
        }

        function addValueLeft() {
            leftValue.unequal = true;
            leftOnlyValues.push(leftValue);
            leftValuePos++;
        }

        function addValueRight() {
            rightValue.unequal = true;
            rightOnlyValues.push(rightValue);
            rightValuePos++;
        }
    }
}

/**
 * Updates triples and decides whether to display the view for a single selected version or a diff view for two versions
 */
function updateView() {
    if(loadedTriples.right !== null) {
        var rightTriplesGrouped = groupTriples(loadedTriples.right, byObject);
        if (compareMode) {
            var leftTriplesGrouped = groupTriples(loadedTriples.left, byObject);
            var groups = compareGroups(leftTriplesGrouped, rightTriplesGrouped);
        }
        else {
            groups = compareGroups([], rightTriplesGrouped);
        }
        renderTable(groups, compareMode);
    }
}

/**
 * Renders the HTML table with the given triples
 * @param mergedGroups
 * @param compareMode   whether to display the view for a single selected version or a diff view for two versions
 */
function renderTable(mergedGroups) {
    // get placeholder to render the table
    var tripleListPlaceholder = $('#tripleListPlaceholder');
    // create template function for table
    var tripleListTemplate = _.template($('#tripleListTemplate').html());
    //create template to render the list of white, red or green values
    var valueListTemplate = _.template($('#valueListTemplate').html());
    // create template function for single values, to render a single literal or uri
    var valueTemplate = _.template($('#valueTemplate').html());
    // render the table
    tripleListPlaceholder.html(tripleListTemplate({data: mergedGroups, compareMode: compareMode, valueListTemplate: valueListTemplate, valueTemplate:valueTemplate}));
}

/**
 * Initializes the switch to toggle between object-wise and predicate-wise grouping, this happens
 * only the first time the function is called
 */
function initializeSwitches() {
    var groupBySwitch = $("[name='group-by-checkbox']");
    groupBySwitch.bootstrapSwitch({
        onText: 'Object',
        offText: 'Predicate',
        onColor: 'success',
        offColor: 'primary'
    });
    groupBySwitch.on('switchChange.bootstrapSwitch', function (event, state) {
        byObject = state;
        updateView();
    });
    var compareSwitch = $("[name='compare-checkbox']");
    compareSwitch.bootstrapSwitch();
    compareSwitch.on('switchChange.bootstrapSwitch', function (event, state) {
        compareMode = state;
        if(compareMode)
            enablePredecessor();
        else
            updateView();
    });
}

/**
 * selects the last existing version for the entity
 */
function clickLastVersion() {
    $('#versions button').filter(".btn-primary").last().trigger('click');
}

/**
 *
 */
function enablePredecessor() {
    var predecessorVersion = getPredecessorVersion();
    if(predecessorVersion !== undefined && versionIsActive(predecessorVersion)) {
        getTriples(predecessorVersion, "left");
    }
    else {
        loadedTriples.left = [];
        updateView();
    }
}

/**
 * searches for the predecessor version for the current one
 * @returns string of version name. undefined if the version is the first
 */
function getPredecessorVersion() {
    return $("#versions").find(".active").prev().attr("value");
}

function versionIsActive(ver) {
    return $("#versions").find("[value='" + ver + "']").hasClass("btn-primary");
}

var prefixes = {
    "cyc": "http://sw.cyc.com/concept/",
    "d0": "http://www.ontologydesignpatterns.org/ont/d0.owl#",
    "dbc": "http://dbpedia.org/resource/Category:",
    "dbo": "http://dbpedia.org/ontology/",
    "dbp": "http://dbpedia.org/property/",
    "dbr": "http://dbpedia.org/resource/",
    "dc": "http://purl.org/dc/terms/",
    "dc11": "http://purl.org/dc/elements/1.1/",
    "fbase": "http://rdf.freebase.com/ns/",
    "foaf": "http://xmlns.com/foaf/0.1/",
    "geo": "http://www.w3.org/2003/01/geo/wgs84_pos#",
    "georss": "http://www.georss.org/georss/",
    "owl": "http://www.w3.org/2002/07/owl#",
    "prov": "http://www.w3.org/ns/prov#",
    "rdf": "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
    "rdfs": "http://www.w3.org/2000/01/rdf-schema#",
    "schema": "http://schema.org/",
    "skos": "http://www.w3.org/2004/02/skos/core#",
    "umb": "http://umbel.org/umbel/rc/",
    "wd": "http://wikidata.dbpedia.org/resource/",
    "wco": "http://commons.wikimedia.org/wiki/",
    "wmc": "http://upload.wikimedia.org/wikipedia/commons/",
    "wmen": "http://upload.wikimedia.org/wikipedia/en/",
    "wp": "http://en.wikipedia.org/wiki/",
    "yago": "http://dbpedia.org/class/yago/"
};

//Parses the rdf format
var parser = (function() {
    /*
     * Generated by PEG.js 0.8.0.
     *
     * http://pegjs.majda.cz/
     */

    function peg$subclass(child, parent) {
        function ctor() { this.constructor = child; }
        ctor.prototype = parent.prototype;
        child.prototype = new ctor();
    }

    function SyntaxError(message, expected, found, offset, line, column) {
        this.message  = message;
        this.expected = expected;
        this.found    = found;
        this.offset   = offset;
        this.line     = line;
        this.column   = column;

        this.name     = "SyntaxError";
    }

    peg$subclass(SyntaxError, Error);

    function parse(input) {
        var options = arguments.length > 1 ? arguments[1] : {},

            peg$FAILED = {},

            peg$startRuleFunctions = { start: peg$parsestart },
            peg$startRuleFunction  = peg$parsestart,

            peg$c0 = [],
            peg$c1 = peg$FAILED,
            peg$c2 = null,
            peg$c3 = function(stmt) { return stmt },
            peg$c4 = function(predicate, object) { return {predicate:predicate, object:object} },
            peg$c5 = " ",
            peg$c6 = { type: "literal", value: " ", description: "\" \"" },
            peg$c7 = function(predicate) { return predicate },
            peg$c8 = function(iri) { iri.node = "iri"; return iri },
            peg$c9 = "<",
            peg$c10 = { type: "literal", value: "<", description: "\"<\"" },
            peg$c11 = ">",
            peg$c12 = { type: "literal", value: ">", description: "\">\"" },
            peg$c13 = function(chars) { return {plain:chars.join('')} },
            peg$c14 = function(prefix, suffix) { return {prefix:prefix, suffix:suffix} },
            peg$c15 = ":",
            peg$c16 = { type: "literal", value: ":", description: "\":\"" },
            peg$c17 = function(prefix) { return prefix },
            peg$c18 = function(chars) { return chars.join('') },
            peg$c19 = function(untagged, language, type) { var lit = { node:'literal', plain:untagged };
                if(language != null)
                    lit.language = language;
                if(type != null)
                    lit.type = type;
                return lit },
            peg$c20 = "\"",
            peg$c21 = { type: "literal", value: "\"", description: "\"\\\"\"" },
            peg$c22 = "\\\"",
            peg$c23 = { type: "literal", value: "\\\"", description: "\"\\\\\\\"\"" },
            peg$c24 = "@",
            peg$c25 = { type: "literal", value: "@", description: "\"@\"" },
            peg$c26 = function(lang) { return lang },
            peg$c27 = "^^",
            peg$c28 = { type: "literal", value: "^^", description: "\"^^\"" },
            peg$c29 = function(type) { return type },
            peg$c30 = /^[^"\\\n\r]/,
            peg$c31 = { type: "class", value: "[^\"\\\\\\n\\r]", description: "[^\"\\\\\\n\\r]" },
            peg$c32 = /^[^\0- <>"{}|\^`\\]/,
            peg$c33 = { type: "class", value: "[^\\0- <>\"{}|\\^`\\\\]", description: "[^\\0- <>\"{}|\\^`\\\\]" },
            peg$c34 = "\\u",
            peg$c35 = { type: "literal", value: "\\u", description: "\"\\\\u\"" },
            peg$c36 = "\\U",
            peg$c37 = { type: "literal", value: "\\U", description: "\"\\\\U\"" },
            peg$c38 = "\\",
            peg$c39 = { type: "literal", value: "\\", description: "\"\\\\\"" },
            peg$c40 = /^[tbnrf"'\\]/,
            peg$c41 = { type: "class", value: "[tbnrf\"'\\\\]", description: "[tbnrf\"'\\\\]" },
            peg$c42 = /^[0-9a-fA-F]/,
            peg$c43 = { type: "class", value: "[0-9a-fA-F]", description: "[0-9a-fA-F]" },
            peg$c44 = /^[\n\r]/,
            peg$c45 = { type: "class", value: "[\\n\\r]", description: "[\\n\\r]" },
            peg$c46 = "-",
            peg$c47 = { type: "literal", value: "-", description: "\"-\"" },
            peg$c48 = /^[0-9]/,
            peg$c49 = { type: "class", value: "[0-9]", description: "[0-9]" },
            peg$c50 = /^[\xB7]/,
            peg$c51 = { type: "class", value: "[\\xB7]", description: "[\\xB7]" },
            peg$c52 = /^[\u0300-\u036F]/,
            peg$c53 = { type: "class", value: "[\\u0300-\\u036F]", description: "[\\u0300-\\u036F]" },
            peg$c54 = /^[\u203F-\u2040]/,
            peg$c55 = { type: "class", value: "[\\u203F-\\u2040]", description: "[\\u203F-\\u2040]" },
            peg$c56 = "_",
            peg$c57 = { type: "literal", value: "_", description: "\"_\"" },
            peg$c58 = /^[A-Z]/,
            peg$c59 = { type: "class", value: "[A-Z]", description: "[A-Z]" },
            peg$c60 = /^[a-z]/,
            peg$c61 = { type: "class", value: "[a-z]", description: "[a-z]" },
            peg$c62 = /^[\xC0-\xD6]/,
            peg$c63 = { type: "class", value: "[\\xC0-\\xD6]", description: "[\\xC0-\\xD6]" },
            peg$c64 = /^[\xD8-\xF6]/,
            peg$c65 = { type: "class", value: "[\\xD8-\\xF6]", description: "[\\xD8-\\xF6]" },
            peg$c66 = /^[\xF8-\u02FF]/,
            peg$c67 = { type: "class", value: "[\\xF8-\\u02FF]", description: "[\\xF8-\\u02FF]" },
            peg$c68 = /^[\u0370-\u037D]/,
            peg$c69 = { type: "class", value: "[\\u0370-\\u037D]", description: "[\\u0370-\\u037D]" },
            peg$c70 = /^[\u037F-\u1FFF]/,
            peg$c71 = { type: "class", value: "[\\u037F-\\u1FFF]", description: "[\\u037F-\\u1FFF]" },
            peg$c72 = /^[\u200C-\u200D]/,
            peg$c73 = { type: "class", value: "[\\u200C-\\u200D]", description: "[\\u200C-\\u200D]" },
            peg$c74 = /^[\u2070-\u218F]/,
            peg$c75 = { type: "class", value: "[\\u2070-\\u218F]", description: "[\\u2070-\\u218F]" },
            peg$c76 = /^[\u2C00-\u2FEF]/,
            peg$c77 = { type: "class", value: "[\\u2C00-\\u2FEF]", description: "[\\u2C00-\\u2FEF]" },
            peg$c78 = /^[\u3001-\uD7FF]/,
            peg$c79 = { type: "class", value: "[\\u3001-\\uD7FF]", description: "[\\u3001-\\uD7FF]" },
            peg$c80 = /^[\uF900-\uFDCF]/,
            peg$c81 = { type: "class", value: "[\\uF900-\\uFDCF]", description: "[\\uF900-\\uFDCF]" },
            peg$c82 = /^[\uFDF0-\uFFFD]/,
            peg$c83 = { type: "class", value: "[\\uFDF0-\\uFFFD]", description: "[\\uFDF0-\\uFFFD]" },
            peg$c84 = /^[a-zA-Z]/,
            peg$c85 = { type: "class", value: "[a-zA-Z]", description: "[a-zA-Z]" },
            peg$c86 = /^[a-zA-Z0-9]/,
            peg$c87 = { type: "class", value: "[a-zA-Z0-9]", description: "[a-zA-Z0-9]" },
            peg$c88 = function(chars1, chars2) { return chars1.join('') + chars2.join('') },
            peg$c89 = function(chars1, chars2) { return chars1 + chars2.join('') },

            peg$currPos          = 0,
            peg$reportedPos      = 0,
            peg$cachedPos        = 0,
            peg$cachedPosDetails = { line: 1, column: 1, seenCR: false },
            peg$maxFailPos       = 0,
            peg$maxFailExpected  = [],
            peg$silentFails      = 0,

            peg$result;

        if ("startRule" in options) {
            if (!(options.startRule in peg$startRuleFunctions)) {
                throw new Error("Can't start parsing from rule \"" + options.startRule + "\".");
            }

            peg$startRuleFunction = peg$startRuleFunctions[options.startRule];
        }

        function text() {
            return input.substring(peg$reportedPos, peg$currPos);
        }

        function offset() {
            return peg$reportedPos;
        }

        function line() {
            return peg$computePosDetails(peg$reportedPos).line;
        }

        function column() {
            return peg$computePosDetails(peg$reportedPos).column;
        }

        function expected(description) {
            throw peg$buildException(
                null,
                [{ type: "other", description: description }],
                peg$reportedPos
            );
        }

        function error(message) {
            throw peg$buildException(message, null, peg$reportedPos);
        }

        function peg$computePosDetails(pos) {
            function advance(details, startPos, endPos) {
                var p, ch;

                for (p = startPos; p < endPos; p++) {
                    ch = input.charAt(p);
                    if (ch === "\n") {
                        if (!details.seenCR) { details.line++; }
                        details.column = 1;
                        details.seenCR = false;
                    } else if (ch === "\r" || ch === "\u2028" || ch === "\u2029") {
                        details.line++;
                        details.column = 1;
                        details.seenCR = true;
                    } else {
                        details.column++;
                        details.seenCR = false;
                    }
                }
            }

            if (peg$cachedPos !== pos) {
                if (peg$cachedPos > pos) {
                    peg$cachedPos = 0;
                    peg$cachedPosDetails = { line: 1, column: 1, seenCR: false };
                }
                advance(peg$cachedPosDetails, peg$cachedPos, pos);
                peg$cachedPos = pos;
            }

            return peg$cachedPosDetails;
        }

        function peg$fail(expected) {
            if (peg$currPos < peg$maxFailPos) { return; }

            if (peg$currPos > peg$maxFailPos) {
                peg$maxFailPos = peg$currPos;
                peg$maxFailExpected = [];
            }

            peg$maxFailExpected.push(expected);
        }

        function peg$buildException(message, expected, pos) {
            function cleanupExpected(expected) {
                var i = 1;

                expected.sort(function(a, b) {
                    if (a.description < b.description) {
                        return -1;
                    } else if (a.description > b.description) {
                        return 1;
                    } else {
                        return 0;
                    }
                });

                while (i < expected.length) {
                    if (expected[i - 1] === expected[i]) {
                        expected.splice(i, 1);
                    } else {
                        i++;
                    }
                }
            }

            function buildMessage(expected, found) {
                function stringEscape(s) {
                    function hex(ch) { return ch.charCodeAt(0).toString(16).toUpperCase(); }

                    return s
                        .replace(/\\/g,   '\\\\')
                        .replace(/"/g,    '\\"')
                        .replace(/\x08/g, '\\b')
                        .replace(/\t/g,   '\\t')
                        .replace(/\n/g,   '\\n')
                        .replace(/\f/g,   '\\f')
                        .replace(/\r/g,   '\\r')
                        .replace(/[\x00-\x07\x0B\x0E\x0F]/g, function(ch) { return '\\x0' + hex(ch); })
                        .replace(/[\x10-\x1F\x80-\xFF]/g,    function(ch) { return '\\x'  + hex(ch); })
                        .replace(/[\u0180-\u0FFF]/g,         function(ch) { return '\\u0' + hex(ch); })
                        .replace(/[\u1080-\uFFFF]/g,         function(ch) { return '\\u'  + hex(ch); });
                }

                var expectedDescs = new Array(expected.length),
                    expectedDesc, foundDesc, i;

                for (i = 0; i < expected.length; i++) {
                    expectedDescs[i] = expected[i].description;
                }

                expectedDesc = expected.length > 1
                    ? expectedDescs.slice(0, -1).join(", ")
                + " or "
                + expectedDescs[expected.length - 1]
                    : expectedDescs[0];

                foundDesc = found ? "\"" + stringEscape(found) + "\"" : "end of input";

                return "Expected " + expectedDesc + " but " + foundDesc + " found.";
            }

            var posDetails = peg$computePosDetails(pos),
                found      = pos < input.length ? input.charAt(pos) : null;

            if (expected !== null) {
                cleanupExpected(expected);
            }

            return new SyntaxError(
                message !== null ? message : buildMessage(expected, found),
                expected,
                found,
                pos,
                posDetails.line,
                posDetails.column
            );
        }

        function peg$parsestart() {
            var s0;

            s0 = peg$parsestmtlist();

            return s0;
        }

        function peg$parsestmtlist() {
            var s0, s1;

            s0 = [];
            s1 = peg$parsestmtline();
            while (s1 !== peg$FAILED) {
                s0.push(s1);
                s1 = peg$parsestmtline();
            }

            return s0;
        }

        function peg$parsestmtline() {
            var s0, s1, s2;

            s0 = peg$currPos;
            s1 = peg$parsestmt();
            if (s1 !== peg$FAILED) {
                s2 = peg$parsenewline();
                if (s2 === peg$FAILED) {
                    s2 = peg$c2;
                }
                if (s2 !== peg$FAILED) {
                    peg$reportedPos = s0;
                    s1 = peg$c3(s1);
                    s0 = s1;
                } else {
                    peg$currPos = s0;
                    s0 = peg$c1;
                }
            } else {
                peg$currPos = s0;
                s0 = peg$c1;
            }

            return s0;
        }

        function peg$parsestmt() {
            var s0, s1, s2;

            s0 = peg$currPos;
            s1 = peg$parsepredicate_with_space();
            if (s1 !== peg$FAILED) {
                s2 = peg$parseobject();
                if (s2 !== peg$FAILED) {
                    peg$reportedPos = s0;
                    s1 = peg$c4(s1, s2);
                    s0 = s1;
                } else {
                    peg$currPos = s0;
                    s0 = peg$c1;
                }
            } else {
                peg$currPos = s0;
                s0 = peg$c1;
            }

            return s0;
        }

        function peg$parsepredicate_with_space() {
            var s0, s1, s2;

            s0 = peg$currPos;
            s1 = peg$parseiri();
            if (s1 !== peg$FAILED) {
                if (input.charCodeAt(peg$currPos) === 32) {
                    s2 = peg$c5;
                    peg$currPos++;
                } else {
                    s2 = peg$FAILED;
                    if (peg$silentFails === 0) { peg$fail(peg$c6); }
                }
                if (s2 !== peg$FAILED) {
                    peg$reportedPos = s0;
                    s1 = peg$c7(s1);
                    s0 = s1;
                } else {
                    peg$currPos = s0;
                    s0 = peg$c1;
                }
            } else {
                peg$currPos = s0;
                s0 = peg$c1;
            }

            return s0;
        }

        function peg$parseobject() {
            var s0;

            s0 = peg$parseliteral();
            if (s0 === peg$FAILED) {
                s0 = peg$parseiri();
            }

            return s0;
        }

        function peg$parseiri() {
            var s0, s1;

            s0 = peg$currPos;
            s1 = peg$parseunprefixed_iri();
            if (s1 === peg$FAILED) {
                s1 = peg$parseprefixed_iri();
            }
            if (s1 !== peg$FAILED) {
                peg$reportedPos = s0;
                s1 = peg$c8(s1);
            }
            s0 = s1;

            return s0;
        }

        function peg$parseunprefixed_iri() {
            var s0, s1, s2, s3;

            s0 = peg$currPos;
            if (input.charCodeAt(peg$currPos) === 60) {
                s1 = peg$c9;
                peg$currPos++;
            } else {
                s1 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c10); }
            }
            if (s1 !== peg$FAILED) {
                s2 = [];
                s3 = peg$parseirichar();
                while (s3 !== peg$FAILED) {
                    s2.push(s3);
                    s3 = peg$parseirichar();
                }
                if (s2 !== peg$FAILED) {
                    if (input.charCodeAt(peg$currPos) === 62) {
                        s3 = peg$c11;
                        peg$currPos++;
                    } else {
                        s3 = peg$FAILED;
                        if (peg$silentFails === 0) { peg$fail(peg$c12); }
                    }
                    if (s3 !== peg$FAILED) {
                        peg$reportedPos = s0;
                        s1 = peg$c13(s2);
                        s0 = s1;
                    } else {
                        peg$currPos = s0;
                        s0 = peg$c1;
                    }
                } else {
                    peg$currPos = s0;
                    s0 = peg$c1;
                }
            } else {
                peg$currPos = s0;
                s0 = peg$c1;
            }

            return s0;
        }

        function peg$parseprefixed_iri() {
            var s0, s1, s2;

            s0 = peg$currPos;
            s1 = peg$parseprefix_with_colon();
            if (s1 !== peg$FAILED) {
                s2 = peg$parsesuffix();
                if (s2 !== peg$FAILED) {
                    peg$reportedPos = s0;
                    s1 = peg$c14(s1, s2);
                    s0 = s1;
                } else {
                    peg$currPos = s0;
                    s0 = peg$c1;
                }
            } else {
                peg$currPos = s0;
                s0 = peg$c1;
            }

            return s0;
        }

        function peg$parseprefix_with_colon() {
            var s0, s1, s2;

            s0 = peg$currPos;
            s1 = peg$parseprefix_string();
            if (s1 !== peg$FAILED) {
                if (input.charCodeAt(peg$currPos) === 58) {
                    s2 = peg$c15;
                    peg$currPos++;
                } else {
                    s2 = peg$FAILED;
                    if (peg$silentFails === 0) { peg$fail(peg$c16); }
                }
                if (s2 !== peg$FAILED) {
                    peg$reportedPos = s0;
                    s1 = peg$c17(s1);
                    s0 = s1;
                } else {
                    peg$currPos = s0;
                    s0 = peg$c1;
                }
            } else {
                peg$currPos = s0;
                s0 = peg$c1;
            }

            return s0;
        }

        function peg$parsesuffix() {
            var s0, s1, s2;

            s0 = peg$currPos;
            s1 = [];
            s2 = peg$parseirichar();
            while (s2 !== peg$FAILED) {
                s1.push(s2);
                s2 = peg$parseirichar();
            }
            if (s1 !== peg$FAILED) {
                peg$reportedPos = s0;
                s1 = peg$c18(s1);
            }
            s0 = s1;

            return s0;
        }

        function peg$parseliteral() {
            var s0, s1, s2, s3;

            s0 = peg$currPos;
            s1 = peg$parsesingle_quote_literal();
            if (s1 !== peg$FAILED) {
                s2 = peg$parselanguage_tag();
                if (s2 === peg$FAILED) {
                    s2 = peg$c2;
                }
                if (s2 !== peg$FAILED) {
                    s3 = peg$parsetype_tag();
                    if (s3 === peg$FAILED) {
                        s3 = peg$c2;
                    }
                    if (s3 !== peg$FAILED) {
                        peg$reportedPos = s0;
                        s1 = peg$c19(s1, s2, s3);
                        s0 = s1;
                    } else {
                        peg$currPos = s0;
                        s0 = peg$c1;
                    }
                } else {
                    peg$currPos = s0;
                    s0 = peg$c1;
                }
            } else {
                peg$currPos = s0;
                s0 = peg$c1;
            }

            return s0;
        }

        function peg$parsesingle_quote_literal() {
            var s0, s1, s2, s3;

            s0 = peg$currPos;
            if (input.charCodeAt(peg$currPos) === 34) {
                s1 = peg$c20;
                peg$currPos++;
            } else {
                s1 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c21); }
            }
            if (s1 !== peg$FAILED) {
                s2 = [];
                s3 = peg$parseliteralchar();
                if (s3 === peg$FAILED) {
                    if (input.substr(peg$currPos, 2) === peg$c22) {
                        s3 = peg$c22;
                        peg$currPos += 2;
                    } else {
                        s3 = peg$FAILED;
                        if (peg$silentFails === 0) { peg$fail(peg$c23); }
                    }
                }
                while (s3 !== peg$FAILED) {
                    s2.push(s3);
                    s3 = peg$parseliteralchar();
                    if (s3 === peg$FAILED) {
                        if (input.substr(peg$currPos, 2) === peg$c22) {
                            s3 = peg$c22;
                            peg$currPos += 2;
                        } else {
                            s3 = peg$FAILED;
                            if (peg$silentFails === 0) { peg$fail(peg$c23); }
                        }
                    }
                }
                if (s2 !== peg$FAILED) {
                    if (input.charCodeAt(peg$currPos) === 34) {
                        s3 = peg$c20;
                        peg$currPos++;
                    } else {
                        s3 = peg$FAILED;
                        if (peg$silentFails === 0) { peg$fail(peg$c21); }
                    }
                    if (s3 !== peg$FAILED) {
                        peg$reportedPos = s0;
                        s1 = peg$c18(s2);
                        s0 = s1;
                    } else {
                        peg$currPos = s0;
                        s0 = peg$c1;
                    }
                } else {
                    peg$currPos = s0;
                    s0 = peg$c1;
                }
            } else {
                peg$currPos = s0;
                s0 = peg$c1;
            }

            return s0;
        }

        function peg$parselanguage_tag() {
            var s0, s1, s2;

            s0 = peg$currPos;
            if (input.charCodeAt(peg$currPos) === 64) {
                s1 = peg$c24;
                peg$currPos++;
            } else {
                s1 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c25); }
            }
            if (s1 !== peg$FAILED) {
                s2 = peg$parselangtag_string();
                if (s2 !== peg$FAILED) {
                    peg$reportedPos = s0;
                    s1 = peg$c26(s2);
                    s0 = s1;
                } else {
                    peg$currPos = s0;
                    s0 = peg$c1;
                }
            } else {
                peg$currPos = s0;
                s0 = peg$c1;
            }

            return s0;
        }

        function peg$parsetype_tag() {
            var s0, s1, s2;

            s0 = peg$currPos;
            if (input.substr(peg$currPos, 2) === peg$c27) {
                s1 = peg$c27;
                peg$currPos += 2;
            } else {
                s1 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c28); }
            }
            if (s1 !== peg$FAILED) {
                s2 = peg$parseiri();
                if (s2 === peg$FAILED) {
                    s2 = peg$parsesingle_quote_literal();
                }
                if (s2 !== peg$FAILED) {
                    peg$reportedPos = s0;
                    s1 = peg$c29(s2);
                    s0 = s1;
                } else {
                    peg$currPos = s0;
                    s0 = peg$c1;
                }
            } else {
                peg$currPos = s0;
                s0 = peg$c1;
            }

            return s0;
        }

        function peg$parseliteralchar() {
            var s0;

            if (peg$c30.test(input.charAt(peg$currPos))) {
                s0 = input.charAt(peg$currPos);
                peg$currPos++;
            } else {
                s0 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c31); }
            }
            if (s0 === peg$FAILED) {
                s0 = peg$parseechar();
                if (s0 === peg$FAILED) {
                    s0 = peg$parseuchar();
                }
            }

            return s0;
        }

        function peg$parseirichar() {
            var s0;

            if (peg$c32.test(input.charAt(peg$currPos))) {
                s0 = input.charAt(peg$currPos);
                peg$currPos++;
            } else {
                s0 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c33); }
            }
            if (s0 === peg$FAILED) {
                s0 = peg$parseuchar();
            }

            return s0;
        }

        function peg$parseuchar() {
            var s0, s1, s2, s3, s4, s5, s6, s7, s8, s9;

            s0 = peg$currPos;
            if (input.substr(peg$currPos, 2) === peg$c34) {
                s1 = peg$c34;
                peg$currPos += 2;
            } else {
                s1 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c35); }
            }
            if (s1 !== peg$FAILED) {
                s2 = peg$parsehex();
                if (s2 !== peg$FAILED) {
                    s3 = peg$parsehex();
                    if (s3 !== peg$FAILED) {
                        s4 = peg$parsehex();
                        if (s4 !== peg$FAILED) {
                            s5 = peg$parsehex();
                            if (s5 !== peg$FAILED) {
                                s1 = [s1, s2, s3, s4, s5];
                                s0 = s1;
                            } else {
                                peg$currPos = s0;
                                s0 = peg$c1;
                            }
                        } else {
                            peg$currPos = s0;
                            s0 = peg$c1;
                        }
                    } else {
                        peg$currPos = s0;
                        s0 = peg$c1;
                    }
                } else {
                    peg$currPos = s0;
                    s0 = peg$c1;
                }
            } else {
                peg$currPos = s0;
                s0 = peg$c1;
            }
            if (s0 === peg$FAILED) {
                s0 = peg$currPos;
                if (input.substr(peg$currPos, 2) === peg$c36) {
                    s1 = peg$c36;
                    peg$currPos += 2;
                } else {
                    s1 = peg$FAILED;
                    if (peg$silentFails === 0) { peg$fail(peg$c37); }
                }
                if (s1 !== peg$FAILED) {
                    s2 = peg$parsehex();
                    if (s2 !== peg$FAILED) {
                        s3 = peg$parsehex();
                        if (s3 !== peg$FAILED) {
                            s4 = peg$parsehex();
                            if (s4 !== peg$FAILED) {
                                s5 = peg$parsehex();
                                if (s5 !== peg$FAILED) {
                                    s6 = peg$parsehex();
                                    if (s6 !== peg$FAILED) {
                                        s7 = peg$parsehex();
                                        if (s7 !== peg$FAILED) {
                                            s8 = peg$parsehex();
                                            if (s8 !== peg$FAILED) {
                                                s9 = peg$parsehex();
                                                if (s9 !== peg$FAILED) {
                                                    s1 = [s1, s2, s3, s4, s5, s6, s7, s8, s9];
                                                    s0 = s1;
                                                } else {
                                                    peg$currPos = s0;
                                                    s0 = peg$c1;
                                                }
                                            } else {
                                                peg$currPos = s0;
                                                s0 = peg$c1;
                                            }
                                        } else {
                                            peg$currPos = s0;
                                            s0 = peg$c1;
                                        }
                                    } else {
                                        peg$currPos = s0;
                                        s0 = peg$c1;
                                    }
                                } else {
                                    peg$currPos = s0;
                                    s0 = peg$c1;
                                }
                            } else {
                                peg$currPos = s0;
                                s0 = peg$c1;
                            }
                        } else {
                            peg$currPos = s0;
                            s0 = peg$c1;
                        }
                    } else {
                        peg$currPos = s0;
                        s0 = peg$c1;
                    }
                } else {
                    peg$currPos = s0;
                    s0 = peg$c1;
                }
            }

            return s0;
        }

        function peg$parseechar() {
            var s0, s1, s2;

            s0 = peg$currPos;
            if (input.charCodeAt(peg$currPos) === 92) {
                s1 = peg$c38;
                peg$currPos++;
            } else {
                s1 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c39); }
            }
            if (s1 !== peg$FAILED) {
                if (peg$c40.test(input.charAt(peg$currPos))) {
                    s2 = input.charAt(peg$currPos);
                    peg$currPos++;
                } else {
                    s2 = peg$FAILED;
                    if (peg$silentFails === 0) { peg$fail(peg$c41); }
                }
                if (s2 !== peg$FAILED) {
                    s1 = [s1, s2];
                    s0 = s1;
                } else {
                    peg$currPos = s0;
                    s0 = peg$c1;
                }
            } else {
                peg$currPos = s0;
                s0 = peg$c1;
            }

            return s0;
        }

        function peg$parsehex() {
            var s0;

            if (peg$c42.test(input.charAt(peg$currPos))) {
                s0 = input.charAt(peg$currPos);
                peg$currPos++;
            } else {
                s0 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c43); }
            }

            return s0;
        }

        function peg$parsenewline() {
            var s0, s1;

            s0 = [];
            if (peg$c44.test(input.charAt(peg$currPos))) {
                s1 = input.charAt(peg$currPos);
                peg$currPos++;
            } else {
                s1 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c45); }
            }
            if (s1 !== peg$FAILED) {
                while (s1 !== peg$FAILED) {
                    s0.push(s1);
                    if (peg$c44.test(input.charAt(peg$currPos))) {
                        s1 = input.charAt(peg$currPos);
                        peg$currPos++;
                    } else {
                        s1 = peg$FAILED;
                        if (peg$silentFails === 0) { peg$fail(peg$c45); }
                    }
                }
            } else {
                s0 = peg$c1;
            }

            return s0;
        }

        function peg$parsepnchars() {
            var s0;

            s0 = peg$parsepncharsu();
            if (s0 === peg$FAILED) {
                if (input.charCodeAt(peg$currPos) === 45) {
                    s0 = peg$c46;
                    peg$currPos++;
                } else {
                    s0 = peg$FAILED;
                    if (peg$silentFails === 0) { peg$fail(peg$c47); }
                }
                if (s0 === peg$FAILED) {
                    if (peg$c48.test(input.charAt(peg$currPos))) {
                        s0 = input.charAt(peg$currPos);
                        peg$currPos++;
                    } else {
                        s0 = peg$FAILED;
                        if (peg$silentFails === 0) { peg$fail(peg$c49); }
                    }
                    if (s0 === peg$FAILED) {
                        if (peg$c50.test(input.charAt(peg$currPos))) {
                            s0 = input.charAt(peg$currPos);
                            peg$currPos++;
                        } else {
                            s0 = peg$FAILED;
                            if (peg$silentFails === 0) { peg$fail(peg$c51); }
                        }
                        if (s0 === peg$FAILED) {
                            if (peg$c52.test(input.charAt(peg$currPos))) {
                                s0 = input.charAt(peg$currPos);
                                peg$currPos++;
                            } else {
                                s0 = peg$FAILED;
                                if (peg$silentFails === 0) { peg$fail(peg$c53); }
                            }
                            if (s0 === peg$FAILED) {
                                if (peg$c54.test(input.charAt(peg$currPos))) {
                                    s0 = input.charAt(peg$currPos);
                                    peg$currPos++;
                                } else {
                                    s0 = peg$FAILED;
                                    if (peg$silentFails === 0) { peg$fail(peg$c55); }
                                }
                            }
                        }
                    }
                }
            }

            return s0;
        }

        function peg$parsepncharsu() {
            var s0;

            s0 = peg$parsepncharsbase();
            if (s0 === peg$FAILED) {
                if (input.charCodeAt(peg$currPos) === 95) {
                    s0 = peg$c56;
                    peg$currPos++;
                } else {
                    s0 = peg$FAILED;
                    if (peg$silentFails === 0) { peg$fail(peg$c57); }
                }
            }

            return s0;
        }

        function peg$parsepncharsbase() {
            var s0;

            if (peg$c58.test(input.charAt(peg$currPos))) {
                s0 = input.charAt(peg$currPos);
                peg$currPos++;
            } else {
                s0 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c59); }
            }
            if (s0 === peg$FAILED) {
                if (peg$c60.test(input.charAt(peg$currPos))) {
                    s0 = input.charAt(peg$currPos);
                    peg$currPos++;
                } else {
                    s0 = peg$FAILED;
                    if (peg$silentFails === 0) { peg$fail(peg$c61); }
                }
                if (s0 === peg$FAILED) {
                    if (peg$c62.test(input.charAt(peg$currPos))) {
                        s0 = input.charAt(peg$currPos);
                        peg$currPos++;
                    } else {
                        s0 = peg$FAILED;
                        if (peg$silentFails === 0) { peg$fail(peg$c63); }
                    }
                    if (s0 === peg$FAILED) {
                        if (peg$c64.test(input.charAt(peg$currPos))) {
                            s0 = input.charAt(peg$currPos);
                            peg$currPos++;
                        } else {
                            s0 = peg$FAILED;
                            if (peg$silentFails === 0) { peg$fail(peg$c65); }
                        }
                        if (s0 === peg$FAILED) {
                            if (peg$c66.test(input.charAt(peg$currPos))) {
                                s0 = input.charAt(peg$currPos);
                                peg$currPos++;
                            } else {
                                s0 = peg$FAILED;
                                if (peg$silentFails === 0) { peg$fail(peg$c67); }
                            }
                            if (s0 === peg$FAILED) {
                                if (peg$c68.test(input.charAt(peg$currPos))) {
                                    s0 = input.charAt(peg$currPos);
                                    peg$currPos++;
                                } else {
                                    s0 = peg$FAILED;
                                    if (peg$silentFails === 0) { peg$fail(peg$c69); }
                                }
                                if (s0 === peg$FAILED) {
                                    if (peg$c70.test(input.charAt(peg$currPos))) {
                                        s0 = input.charAt(peg$currPos);
                                        peg$currPos++;
                                    } else {
                                        s0 = peg$FAILED;
                                        if (peg$silentFails === 0) { peg$fail(peg$c71); }
                                    }
                                    if (s0 === peg$FAILED) {
                                        if (peg$c72.test(input.charAt(peg$currPos))) {
                                            s0 = input.charAt(peg$currPos);
                                            peg$currPos++;
                                        } else {
                                            s0 = peg$FAILED;
                                            if (peg$silentFails === 0) { peg$fail(peg$c73); }
                                        }
                                        if (s0 === peg$FAILED) {
                                            if (peg$c74.test(input.charAt(peg$currPos))) {
                                                s0 = input.charAt(peg$currPos);
                                                peg$currPos++;
                                            } else {
                                                s0 = peg$FAILED;
                                                if (peg$silentFails === 0) { peg$fail(peg$c75); }
                                            }
                                            if (s0 === peg$FAILED) {
                                                if (peg$c76.test(input.charAt(peg$currPos))) {
                                                    s0 = input.charAt(peg$currPos);
                                                    peg$currPos++;
                                                } else {
                                                    s0 = peg$FAILED;
                                                    if (peg$silentFails === 0) { peg$fail(peg$c77); }
                                                }
                                                if (s0 === peg$FAILED) {
                                                    if (peg$c78.test(input.charAt(peg$currPos))) {
                                                        s0 = input.charAt(peg$currPos);
                                                        peg$currPos++;
                                                    } else {
                                                        s0 = peg$FAILED;
                                                        if (peg$silentFails === 0) { peg$fail(peg$c79); }
                                                    }
                                                    if (s0 === peg$FAILED) {
                                                        if (peg$c80.test(input.charAt(peg$currPos))) {
                                                            s0 = input.charAt(peg$currPos);
                                                            peg$currPos++;
                                                        } else {
                                                            s0 = peg$FAILED;
                                                            if (peg$silentFails === 0) { peg$fail(peg$c81); }
                                                        }
                                                        if (s0 === peg$FAILED) {
                                                            if (peg$c82.test(input.charAt(peg$currPos))) {
                                                                s0 = input.charAt(peg$currPos);
                                                                peg$currPos++;
                                                            } else {
                                                                s0 = peg$FAILED;
                                                                if (peg$silentFails === 0) { peg$fail(peg$c83); }
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }

            return s0;
        }

        function peg$parselangtag_string() {
            var s0, s1, s2, s3, s4, s5, s6;

            s0 = peg$currPos;
            s1 = [];
            if (peg$c84.test(input.charAt(peg$currPos))) {
                s2 = input.charAt(peg$currPos);
                peg$currPos++;
            } else {
                s2 = peg$FAILED;
                if (peg$silentFails === 0) { peg$fail(peg$c85); }
            }
            if (s2 !== peg$FAILED) {
                while (s2 !== peg$FAILED) {
                    s1.push(s2);
                    if (peg$c84.test(input.charAt(peg$currPos))) {
                        s2 = input.charAt(peg$currPos);
                        peg$currPos++;
                    } else {
                        s2 = peg$FAILED;
                        if (peg$silentFails === 0) { peg$fail(peg$c85); }
                    }
                }
            } else {
                s1 = peg$c1;
            }
            if (s1 !== peg$FAILED) {
                s2 = [];
                s3 = peg$currPos;
                if (input.charCodeAt(peg$currPos) === 45) {
                    s4 = peg$c46;
                    peg$currPos++;
                } else {
                    s4 = peg$FAILED;
                    if (peg$silentFails === 0) { peg$fail(peg$c47); }
                }
                if (s4 !== peg$FAILED) {
                    s5 = [];
                    if (peg$c86.test(input.charAt(peg$currPos))) {
                        s6 = input.charAt(peg$currPos);
                        peg$currPos++;
                    } else {
                        s6 = peg$FAILED;
                        if (peg$silentFails === 0) { peg$fail(peg$c87); }
                    }
                    if (s6 !== peg$FAILED) {
                        while (s6 !== peg$FAILED) {
                            s5.push(s6);
                            if (peg$c86.test(input.charAt(peg$currPos))) {
                                s6 = input.charAt(peg$currPos);
                                peg$currPos++;
                            } else {
                                s6 = peg$FAILED;
                                if (peg$silentFails === 0) { peg$fail(peg$c87); }
                            }
                        }
                    } else {
                        s5 = peg$c1;
                    }
                    if (s5 !== peg$FAILED) {
                        s4 = [s4, s5];
                        s3 = s4;
                    } else {
                        peg$currPos = s3;
                        s3 = peg$c1;
                    }
                } else {
                    peg$currPos = s3;
                    s3 = peg$c1;
                }
                while (s3 !== peg$FAILED) {
                    s2.push(s3);
                    s3 = peg$currPos;
                    if (input.charCodeAt(peg$currPos) === 45) {
                        s4 = peg$c46;
                        peg$currPos++;
                    } else {
                        s4 = peg$FAILED;
                        if (peg$silentFails === 0) { peg$fail(peg$c47); }
                    }
                    if (s4 !== peg$FAILED) {
                        s5 = [];
                        if (peg$c86.test(input.charAt(peg$currPos))) {
                            s6 = input.charAt(peg$currPos);
                            peg$currPos++;
                        } else {
                            s6 = peg$FAILED;
                            if (peg$silentFails === 0) { peg$fail(peg$c87); }
                        }
                        if (s6 !== peg$FAILED) {
                            while (s6 !== peg$FAILED) {
                                s5.push(s6);
                                if (peg$c86.test(input.charAt(peg$currPos))) {
                                    s6 = input.charAt(peg$currPos);
                                    peg$currPos++;
                                } else {
                                    s6 = peg$FAILED;
                                    if (peg$silentFails === 0) { peg$fail(peg$c87); }
                                }
                            }
                        } else {
                            s5 = peg$c1;
                        }
                        if (s5 !== peg$FAILED) {
                            s4 = [s4, s5];
                            s3 = s4;
                        } else {
                            peg$currPos = s3;
                            s3 = peg$c1;
                        }
                    } else {
                        peg$currPos = s3;
                        s3 = peg$c1;
                    }
                }
                if (s2 !== peg$FAILED) {
                    peg$reportedPos = s0;
                    s1 = peg$c88(s1, s2);
                    s0 = s1;
                } else {
                    peg$currPos = s0;
                    s0 = peg$c1;
                }
            } else {
                peg$currPos = s0;
                s0 = peg$c1;
            }

            return s0;
        }

        function peg$parseprefix_string() {
            var s0, s1, s2, s3;

            s0 = peg$currPos;
            s1 = peg$parsepncharsbase();
            if (s1 !== peg$FAILED) {
                s2 = [];
                s3 = peg$parsepnchars();
                while (s3 !== peg$FAILED) {
                    s2.push(s3);
                    s3 = peg$parsepnchars();
                }
                if (s2 !== peg$FAILED) {
                    peg$reportedPos = s0;
                    s1 = peg$c89(s1, s2);
                    s0 = s1;
                } else {
                    peg$currPos = s0;
                    s0 = peg$c1;
                }
            } else {
                peg$currPos = s0;
                s0 = peg$c1;
            }

            return s0;
        }

        peg$result = peg$startRuleFunction();

        if (peg$result !== peg$FAILED && peg$currPos === input.length) {
            return peg$result;
        } else {
            if (peg$result !== peg$FAILED && peg$currPos < input.length) {
                peg$fail({ type: "end", description: "end of input" });
            }

            throw peg$buildException(null, peg$maxFailExpected, peg$maxFailPos);
        }
    }

    return {
        SyntaxError: SyntaxError,
        parse:       parse
    };
})();