//when the version selector has been clicked
$('#versionsel li').on('click', function(){
	var version = $(this).text();
	updateVersionSelector(version, $(this));
	updateTriples(version);
});

//helper for http get
function httpGet(theUrl)
{
    var xmlHttp = null;
    xmlHttp = new XMLHttpRequest();
    xmlHttp.open( "GET", theUrl, false );
    xmlHttp.send( null );
    return xmlHttp.responseText;
}

function makeTable(triples) {
	// empty current table
	$('#tripleListPlaceholder').html("");
    // create template function
	var elementTemplate = _.template($('#tripleListTemplate').html());
	// render the template with the given data
	$('#tripleListPlaceholder').append(elementTemplate({data: triples}));
}	

function updateVersionSelector(version, element) {
	element.parents('.dropdown').find('.dropdown-toggle').html(version+' <span class="caret"></span>');
}

function updateTriples(version) {
	var path = window.location.pathname + "/" + version;
    var plainTriples = httpGet(path);
    var parsedTriples = JSON.parse(plainTriples);
    makeTable(parsedTriples);
}