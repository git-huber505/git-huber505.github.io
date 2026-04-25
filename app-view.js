/*
This is the view portion of our application.
it will handle all html/DOM references and appropriate rendering/updating

NOTE: nothing in here should call functions from model
if it does then it's not an MVC!!!!
*/

//||||||||||||||||||| HTML ELEMENTS |||||||||||||||||||
//||||||||||||||||||| HTML ELEMENTS |||||||||||||||||||
//||||||||||||||||||| HTML ELEMENTS |||||||||||||||||||

const pageSetup = document.getElementById('page-setup');
const pageMain  = document.getElementById('page-main');

const inputCsvFile = document.getElementById('input-csv-file');
const inputApiKey  = document.getElementById('input-api-key');
const inputSearch  = document.getElementById('input-search');

const imageApplicationState = document.getElementById('image-application-state');

const buttonSetup  = document.getElementById('button-setup');
const buttonSearch = document.getElementById('button-search');

const containerApplicationStatePanel = document.getElementById('container-application-state-panel');
const containerResults               = document.getElementById('container-results');

const textApplicationState = document.getElementById('text-application-state');
const textUploadFilename   = document.getElementById('text-upload-filename');
const textResults          = document.getElementById('text-results');

//template elements
//NOTE: these are hidden at runtime, but these are used for the search result cards
const templateContainer    = document.getElementById('container-result-element-template');
const templateTextTitle    = document.getElementById('text-result-element-title-template');
const templateTextAuthor   = document.getElementById('text-result-element-author-template');
const templateTextYear     = document.getElementById('text-result-element-year-template');
const templateTextURL      = document.getElementById('text-result-element-url-template');
const templateTextAbstract = document.getElementById('text-result-element-abstract-template');

//tracks live result cards so they can be cleared between searches
let bestPaperRankingsHTML = [];

//||||||||||||||||||| STATE PANEL |||||||||||||||||||
//||||||||||||||||||| STATE PANEL |||||||||||||||||||
//||||||||||||||||||| STATE PANEL |||||||||||||||||||
//application state card
//NOTE: most of these are generally just saftey wrapped functions (i.e. only does something if the element exists)

function View_SetStateMessage(message)
{
    if (textApplicationState)
        textApplicationState.textContent = message;
}

function View_SetStateImage(imagePath)
{
    if (imageApplicationState)
        imageApplicationState.src = imagePath;
}

function View_SetStatePanelClass(className)
{
    if (containerApplicationStatePanel)
        containerApplicationStatePanel.className = className;
}

//||||||||||||||||||| PAGE VISIBILITY |||||||||||||||||||
//||||||||||||||||||| PAGE VISIBILITY |||||||||||||||||||
//||||||||||||||||||| PAGE VISIBILITY |||||||||||||||||||

function View_ShowMainPage()
{
    pageSetup.style.display = 'none';
    pageMain.style.display  = 'block';
}

function View_ShowSetupPage()
{
    pageSetup.style.display = 'block';
    pageMain.style.display  = 'none';
}

//||||||||||||||||||| CSV FILENAME |||||||||||||||||||
//||||||||||||||||||| CSV FILENAME |||||||||||||||||||
//||||||||||||||||||| CSV FILENAME |||||||||||||||||||

function View_SetUploadFilename(filename)
{
    if (textUploadFilename)
        textUploadFilename.textContent = `Selected: ${filename}`;
}

//||||||||||||||||||| RESULTS TEXT |||||||||||||||||||
//||||||||||||||||||| RESULTS TEXT |||||||||||||||||||
//||||||||||||||||||| RESULTS TEXT |||||||||||||||||||

function View_SetResultsText(text)
{
    if (textResults)
        textResults.textContent = text;
}

//||||||||||||||||||| RESULT CARDS |||||||||||||||||||
//||||||||||||||||||| RESULT CARDS |||||||||||||||||||
//||||||||||||||||||| RESULT CARDS |||||||||||||||||||

function View_ClearResultCards()
{
    for (let i = 0; i < bestPaperRankingsHTML.length; i++)
    {
        View_DestroyResultCard(bestPaperRankingsHTML[i]);
    }

    bestPaperRankingsHTML = [];
}

function View_DestroyResultCard(resultCard)
{
    if (!resultCard) 
        return;

    const container = resultCard.container;

    if (container && container.parentNode)
        container.parentNode.removeChild(container);
}

//hides the static template nodes that live permanently in the document
function View_HideTemplates()
{
    templateContainer.style.display    = 'none';
    templateTextTitle.style.display    = 'none';
    templateTextAuthor.style.display   = 'none';
    templateTextYear.style.display     = 'none';
    templateTextURL.style.display      = 'none';
    templateTextAbstract.style.display = 'none';
}

//accepts a paper object { title, authors, year, url, abstract }
//and creates a html card with the data filled out
function View_CreateResultCard(paper)
{
    if (!templateContainer) 
        return;

    //clone full container and it's children
    const clonedContainer = templateContainer.cloneNode(true);

    //remove template ID so duplicates don't conflict
    clonedContainer.removeAttribute('id');

    //get cloned children
    const clonedTitle    = clonedContainer.querySelector('#text-result-element-title-template');
    const clonedAuthor   = clonedContainer.querySelector('#text-result-element-author-template');
    const clonedYear     = clonedContainer.querySelector('#text-result-element-year-template');
    const clonedURL      = clonedContainer.querySelector('#text-result-element-url-template');
    const clonedAbstract = clonedContainer.querySelector('#text-result-element-abstract-template');

    //unhide clones
    clonedContainer.style.display = 'block';

    if (clonedTitle)
        clonedTitle.style.display    = 'block';

    if (clonedAuthor)
        clonedAuthor.style.display   = 'block';

    if (clonedYear)
        clonedYear.style.display     = 'block';

    if (clonedURL)
        clonedURL.style.display      = 'block';

    if (clonedAbstract)
        clonedAbstract.style.display = 'block';

    //remove IDs so duplicates don't conflict
    clonedTitle?.removeAttribute('id');
    clonedAuthor?.removeAttribute('id');
    clonedYear?.removeAttribute('id');
    clonedURL?.removeAttribute('id');
    clonedAbstract?.removeAttribute('id');

    //update text fields
    if (clonedTitle) //saftey check: make sure element exists before we do anything with it
        clonedTitle.textContent    = 'Title: '    + (paper.title    || 'Untitled');

    if (clonedAuthor) //saftey check: make sure element exists before we do anything with it
        clonedAuthor.textContent   = 'Author: '   + (paper.authors  || 'Unknown authors');

    if (clonedYear) //saftey check: make sure element exists before we do anything with it
        clonedYear.textContent     = 'Year: '     + (paper.year     || 'Unknown');

    if (clonedAbstract) //saftey check: make sure element exists before we do anything with it
        clonedAbstract.textContent = 'Abstract: ' + (paper.abstract || '');

    if (clonedURL) //saftey check: make sure element exists before we do anything with it
    {
        clonedURL.textContent = paper.url || '';
        clonedURL.href        = paper.url || '#';
    }

    //apply results to container
    containerResults.appendChild(clonedContainer);

    //store html reference and add it to our array
    bestPaperRankingsHTML.push({ container: clonedContainer });
}

//renders a full list of paper objects, clearing any previous results first
function View_RenderResultCards(papers)
{
    View_HideTemplates();
    View_ClearResultCards();

    for (let i = 0; i < papers.length; i++)
    {
        View_CreateResultCard(papers[i]);
    }
}

//||||||||||||||||||| INPUT READERS |||||||||||||||||||
//||||||||||||||||||| INPUT READERS |||||||||||||||||||
//||||||||||||||||||| INPUT READERS |||||||||||||||||||

function View_GetCsvFile()
{ 
    return inputCsvFile.files[0]; 
}

function View_GetApiKey()
{ 
    return inputApiKey.value.trim(); 
}

function View_GetSearchQuery() 
{ 
    return inputSearch.value.trim(); 
}