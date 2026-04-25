/*
This is the model portion of our application.
it will own the app state/data
any functions needed are exposed

NOTE: nothing in here should touch the HTML/DOM
if it does then it's not an MVC!!!!
*/

//||||||||||||||||||| APPLICATION DYNAMIC VARIABLES |||||||||||||||||||
//||||||||||||||||||| APPLICATION DYNAMIC VARIABLES |||||||||||||||||||
//||||||||||||||||||| APPLICATION DYNAMIC VARIABLES |||||||||||||||||||
//NOTE: these will change at runtime

let setup_csvFilename = '';
let setup_apiKey = '';
let setupComplete = false;

let currentApplicationStateCode = 0;
let currentUserPrompt = '';
let originalCSVHeaders = [];
let originalPapers = [];
let paperRankings = [];
let bestPaperRankings = [];

//||||||||||||||||||| APPLICATION CONST VARIABLES |||||||||||||||||||
//||||||||||||||||||| APPLICATION CONST VARIABLES |||||||||||||||||||
//||||||||||||||||||| APPLICATION CONST VARIABLES |||||||||||||||||||
//NOTE: these should not change at runtime, they are constant

const applicationStateSetupCode      = 0;
const applicationStateIdleCode       = 1;
const applicationStateErrorCode      = 2;
const applicationStateProcessingCode = 3;
const applicationStateSearchSuccess  = 4;
const applicationStateSearchFail     = 5;

//these are weights that can be adjusted manually
//these get used during filtering so if we end up with a large amount of results
//we can use these to help sort the filtered collection
//thereby picking the best of the bunch that we can send off to the LLM for final ranking
const filterTitleWeight    = 5;
const filterAbstractWeight = 2;
const filterAuthorWeight   = 3;
const filterYearWeight     = 4;
const filterURLWeight      = 10;

//this is a variable that controls how many of the final filtered elements will be picked
//these final filtered elements get sent off to the LLM again for final refinement
//to keep token usage with AI optimal and efficent, it's best to keep this small
const filterMaxRefinementCount = 10;

const applicationStateImagePaths = [
  "resources/state-setup.svg",          //0
  "resources/state-idle.svg",           //1
  "resources/state-error.svg",          //2
  "resources/state-searching.svg",      //3
  "resources/state-articles-found.svg", //4
  "resources/state-nothing-found.svg",  //5
];

const containerApplicationStatePanelClasses = [
  "state-panel",            //0
  "state-panel",            //1
  "state-panel-error",      //2
  "state-panel-processing", //3
  "state-panel-sucess",     //4
  "state-panel",            //5
];

//google gemeni AI models
//NOTE: if we hit rate limits just swap to a differnet one
//const urlLLM = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
//const urlLLM = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent';
const urlLLM = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent';

//||||||||||||||||||| STATE GETTERS / SETTERS |||||||||||||||||||
//||||||||||||||||||| STATE GETTERS / SETTERS |||||||||||||||||||
//||||||||||||||||||| STATE GETTERS / SETTERS |||||||||||||||||||

//gets
function Model_GetSetupComplete()
{ 
    return setupComplete; 
}

function Model_GetCurrentStateCode()
{ 
    return currentApplicationStateCode; 
}

function Model_GetStateImagePath(code)
{ 
    return applicationStateImagePaths[code]; 
}

function Model_GetStatePanelClass(code)
{ 
    return containerApplicationStatePanelClasses[code]; 
}

function Model_GetBestPaperRankings()
{ 
    return bestPaperRankings; 
}

function Model_GetPaperByIndex(index)
{ 
    return originalPapers[index]; 
}

//sets
function Model_SetCurrentStateCode(code)
{ 
    currentApplicationStateCode = code; 
}

function Model_SetCurrentUserPrompt(prompt) 
{ 
    currentUserPrompt = prompt; 
}

//||||||||||||||||||| SETUP |||||||||||||||||||
//||||||||||||||||||| SETUP |||||||||||||||||||
//||||||||||||||||||| SETUP |||||||||||||||||||

async function Model_Setup(file, apiKey)
{
    setupComplete = false;

    if (!file)
        throw new Error('Please select a CSV file!');

    if (!file.name.endsWith('.csv'))
        throw new Error('File must be a .csv!');

    if (!apiKey)
        throw new Error('Please enter an API key!');

    setup_csvFilename = file.name;
    setup_apiKey = apiKey;

    const csvFileText = await file.text();
    ParseCSV(csvFileText);

    setupComplete = true;

    return { 
        count: originalPapers.length, 
        filename: setup_csvFilename 
    };
}

//||||||||||||||||||| CSV PARSING |||||||||||||||||||
//||||||||||||||||||| CSV PARSING |||||||||||||||||||
//||||||||||||||||||| CSV PARSING |||||||||||||||||||

//parse the CSV file to get our papers from the database
function ParseCSV(text)
{
    const rows = [];
    let current = '';
    let row = [];
    let inQuotes = false;

    for (let i = 0; i < text.length; i++)
    {
        const char = text[i];
        const nextChar = text[i + 1];

        //handle escaped quotes ""
        if (char === '"')
        {
            if (inQuotes && nextChar === '"') 
            {
                current += '"';
                i++; //skip next
            } 
            else 
            {
                inQuotes = !inQuotes;
            }
        }
        else if (char === ',' && !inQuotes)
        {
            row.push(current);
            current = '';
        }
        else if ((char === '\n' || char === '\r') && !inQuotes)
        {
            if (current || row.length > 0) 
            {
                row.push(current);
                rows.push(row);
                row = [];
                current = '';
            }
        }
        else
        {
            current += char;
        }
    }

    //push last value
    if (current || row.length > 0) 
    {
        row.push(current);
        rows.push(row);
    }

    if (rows.length === 0)
        throw new Error("Empty CSV");

    //first row = headers
    originalCSVHeaders = rows[0].map(h => h.trim().toLowerCase());

    //remaining rows = data
    originalPapers = [];

    for (let i = 1; i < rows.length; i++)
    {
        ParseCSVElementToPaperObject(rows[i]);
    }

    //NOTE: ideally the database or csv should be clean
    //but sometimes not and in our testing with the database it isnt as we have duplicates polluting search results
    //so to keep things clean unfortunately we will do an additional step here where we will go through
    //and remove duplicates from the parsed papers
    RemoveDuplicatesPapersFromList();
}

//parses a CSV element and creates a paper object that then gets added to originalPapers array
function ParseCSVElementToPaperObject(values)
{
    let csvElement = {};

    //map using headers (this ensures we get what we need even if column order changes)
    originalCSVHeaders.forEach((header, i) => {
        csvElement[header] = values[i]?.trim() || '';
    });

    //construct paper object
    const paper = {
        title:    csvElement.title    || '',
        url:      csvElement.url      || '',
        authors:  csvElement.authors  || '',
        abstract: csvElement.abstract || '',
        citation: csvElement.citation || '',
        year:     csvElement.year     || csvElement.years || ''
    };

    //add it to the original papers array
    originalPapers.push(paper);
}

//additional processing step to remove duplicate papers in array originalPapers
function RemoveDuplicatesPapersFromList()
{
    //saftey check: if we don't have original paper data (or it doesn't have any papers)
    if (!originalPapers || originalPapers.length === 0)
        return; //dont continue

    //NOTE: for efficency we are using a set
    //normally for removing duplicate entries that would require nested for loops iterating over a massive set
    //this can get expensive fast, so to help things performance wise we will effectively only add things as we go
    //we basically use the original paper data to construct a unique key based off title/year/abstract/etc
    //if the key we already constructed exists (meaning there is a duplicate!) then we skip it
    //otherwise the key does not exist, so therefore it is unique and we can add it!

    const seen = new Set();
    const unique = [];

    for (let i = 0; i < originalPapers.length; i++)
    {
        const paper = originalPapers[i];
        let key = ''; //build a dedupe key

        if (paper.url) //URLS are always the strongest identifier, prioritize them!
            key = HelperNormalizeText(paper.url);
        else
        {
            //otherwise for whatever reason if we don't have a URL
            //then we can construct a fallback using title/year/abstract
            const title    = HelperNormalizeText(paper.title);
            const year     = HelperNormalizeText(paper.year);
            const abstract = HelperNormalizeText(paper.abstract).substring(0, 100); //partial for safety, we don't need the entire thing but just enough will do
            key = title + '|' + year + '|' + abstract;
        }

        //if we haven't seen this key before, then add it!
        if (!seen.has(key))
        {
            seen.add(key);
            unique.push(paper);
        }
    }

    originalPapers = unique;
}

//||||||||||||||||||| PAPER RANKINGS |||||||||||||||||||
//||||||||||||||||||| PAPER RANKINGS |||||||||||||||||||
//||||||||||||||||||| PAPER RANKINGS |||||||||||||||||||

//create a paperRankings that is based off originalPapers array
function CreatePaperRankingArray()
{
    for (let i = 0; i < originalPapers.length; i++)
    {
        CreatePaperRankElement(i);
    }
}

//create a paper rank object and add it to our paperRankings array
function CreatePaperRankElement(originalElementIndex)
{
    const paperRank = {
        originalPaperIndex: originalElementIndex,
        score:           0,
        titleMatches:    0,
        abstractMatches: 0,
        authorMatches:   0,
        yearMatches:     0,
        urlMatches:      0
    };

    paperRankings.push(paperRank);
}

//calculate the score for a paper rank based on the matches
function CalculateScoreForPaperRanking(paperRank)
{
    return (
        paperRank.titleMatches    * filterTitleWeight    +
        paperRank.abstractMatches * filterAbstractWeight +
        paperRank.authorMatches   * filterAuthorWeight   +
        paperRank.yearMatches     * filterYearWeight     +
        paperRank.urlMatches      * filterURLWeight
    );
}

//clear paper ranking arrays
function ResetPaperRankings()
{
    paperRankings = [];
    bestPaperRankings = [];
}

//||||||||||||||||||| INITAL FILTERING |||||||||||||||||||
//||||||||||||||||||| INITAL FILTERING |||||||||||||||||||
//||||||||||||||||||| INITAL FILTERING |||||||||||||||||||

//given keywords (if there are any)
//go through the paper rankings to find out how many keyword matches there are
function RankPapersByKeywords(keywords = null)
{
  if (!keywords || keywords.length === 0) //saftey check: make sure we have keywords to work with!
    return; //if not then do nothing!

    const normalizedKeywords = keywords.map(k => HelperCleanupText(k));

    for (let i = 0; i < paperRankings.length; i++)
    {
        const paperRank = paperRankings[i];
        const paper     = originalPapers[paperRank.originalPaperIndex];
        const title     = HelperCleanupText(paper.title);
        const abstract  = HelperCleanupText(paper.abstract);

        for (let k = 0; k < normalizedKeywords.length; k++)
        {
            const keyword = normalizedKeywords[k];
            if (title.includes(keyword))    
                paperRank.titleMatches++;

            if (abstract.includes(keyword)) 
                paperRank.abstractMatches++;
        }
    }
}

//given urls (if there are any)
//go through the paper rankings to find out how many url matches there are
function RankPapersByURLs(urls = null)
{
    if (!urls || urls.length === 0) //saftey check: make sure we have urls to work with!
        return; //if not then do nothing!

    for (let i = 0; i < paperRankings.length; i++)
    {
        const paperRank = paperRankings[i];
        const url       = originalPapers[paperRank.originalPaperIndex].url;

        for (let k = 0; k < urls.length; k++)
        {
            if (url.includes(urls[k])) 
                paperRank.urlMatches++;
        }
    } 
}

//given authors (if there are any)
//go through the paper rankings to find out how many author matches there are
function RankPapersByAuthors(authors = null)
{
  if (!authors || authors.length === 0) //saftey check: make sure we have authors to work with!
    return; //if not then do nothing!

    const normalizedKeywords = authors.map(k => HelperCleanupText(k));

    for (let i = 0; i < paperRankings.length; i++)
    {
        const paperRank    = paperRankings[i];
        const paperAuthors = HelperCleanupText(originalPapers[paperRank.originalPaperIndex].authors);

        for (let k = 0; k < normalizedKeywords.length; k++)
        {
            if (paperAuthors.includes(normalizedKeywords[k])) 
                paperRank.authorMatches++;
        }
    }
}

//given years (if there are any)
//go through the paper rankings to find out how many year matches there are
function RankPapersByYears(years = null)
{
    if (!years || years.length === 0) //saftey check: make sure we have years to work with!
        return; //if not then do nothing!

    for (let i = 0; i < paperRankings.length; i++)
    {
        const paperRank = paperRankings[i];
        const year      = originalPapers[paperRank.originalPaperIndex].year;

        for (let k = 0; k < years.length; k++)
        {
            if (year.includes(years[k])) 
                paperRank.yearMatches++;
        }
    }
}

//go through our paper rankings and completely remove elements that have a score of 0
//no reason to keep them around if they don't match the search query
function PrunePaperRankings()
{
    const simplified = [];

    for (let i = 0; i < paperRankings.length; i++)
    {
        const paperRank = paperRankings[i];
        paperRank.score = CalculateScoreForPaperRanking(paperRank);

        //only meaningful results matter!
        if (paperRank.score > 0) 
            simplified.push(paperRank);
    }

    paperRankings = simplified;
}

//sort paper rankings by score, from highest to lowest
function SortPaperRankingsByScore()
{
    paperRankings.sort((a, b) => b.score - a.score);
}

//after all the filtering, we will select only the best scoring paper rankings from paperRankings array
function GetBestPaperRankings()
{
    bestPaperRankings = [];

    const limit = Math.min(filterMaxRefinementCount, paperRankings.length);

    for (let i = 0; i < limit; i++)
    {
        bestPaperRankings.push(paperRankings[i]);
    }
}

//given a response from the LLM which will extract relevant data 
function Model_FilterPaperSearch(llmResponse)
{
    ResetPaperRankings();
    CreatePaperRankingArray();

    //============== keywords ==============
    //parse llmResponse text to get responseKeywords
    //expected formats...
    //Keywords: None
    //Keywords: Collision
    //Keywords: Collision Detection Physics
    //NOTE: return the words after Keywords: in a string array
    //NOTE: when doing string comparisons, make everything lowercase for simplicity
    //also remove any puncutation or symbols, just alphabetical text and numbers only

    let responseKeywords = null;
    let keywordsRaw = HelperExtractField(llmResponse, 'Keywords');

    if (keywordsRaw && keywordsRaw.toLowerCase() !== 'none')
    {
        keywordsRaw = HelperCleanupText(keywordsRaw);
        responseKeywords = HelperSplitKeywordsToArray(keywordsRaw);
    }

    //============== urls ==============
    //parse llmResponse text to get responseURLs
    //expected formats...
    //URLs: None
    //URLs: https://dl.acm.org/doi/10.1145/2949035.2949053
    //URLs: https://dl.acm.org/doi/10.1145/2949035.2949053 https://dl.acm.org/doi/10.1145/357744.357898
    //NOTE: return the words after URLs: in a string array

    let responseURLs = null;
    let urlsRaw = HelperExtractField(llmResponse, 'URLs');

    if (urlsRaw && urlsRaw.toLowerCase() !== 'none')
    {
        responseURLs = urlsRaw.split(/\s+/).filter(x => x.length > 0);
    }

    //============== authors ==============
    //parse llmResponse text to get responseAuthors
    //expected formats...
    //Authors: None
    //Authors: Hyrum S Anderson
    //Authors: Hyrum S Anderson Jonathan Woodbridge Bobby Filar
    //NOTE: return the words after Authors: in a string array
    //NOTE: when doing string comparisons, make everything lowercase for simplicity
    //also remove any puncutation or symbols, just alphabetical text and numbers only
    let responseAuthors = null;
    let authorsRaw = HelperExtractField(llmResponse, 'Authors');

    if (authorsRaw && authorsRaw.toLowerCase() !== 'none')
    {
        authorsRaw = HelperCleanupText(authorsRaw);
        responseAuthors = HelperSplitKeywordsToArray(authorsRaw);
    }

    //============== years ==============
    //parse llmResponse text to get responseYears
    //expected formats...
    //Years: None
    //Years: 2000 2006
    //Years: 2003
    //NOTE: return the words after Years: in a string array
    //NOTE: if None, then leave responseYears null

    let responseYears = null;
    let yearsRaw = HelperExtractField(llmResponse, 'Years');

    if (yearsRaw && yearsRaw.toLowerCase() !== 'none')
    {
        responseYears = yearsRaw
        .split(/\s+/)
        .map(y => y.trim())
        .filter(y => /^\d+$/.test(y));
    }

    //after collecting all of the relevant search data (if it was specified by the user and extracted by the llm)
    //now go through and collect matches for each of the paper ranks so we can calculate a score later
    RankPapersByKeywords(responseKeywords);
    RankPapersByURLs(responseURLs);
    RankPapersByAuthors(responseAuthors);
    RankPapersByYears(responseYears);

    //after collecting matches, this will calculate the paper score
    //now if the resulting paper score is 0 it will be removed entirely from paperRankings array
    PrunePaperRankings();

    //sort by highest score
    SortPaperRankingsByScore();

    //only get the tippy top based on filterMaxRefinementCount
    GetBestPaperRankings();

    return bestPaperRankings.length;
}

//||||||||||||||||||| REFINEMENT |||||||||||||||||||
//||||||||||||||||||| REFINEMENT |||||||||||||||||||
//||||||||||||||||||| REFINEMENT |||||||||||||||||||

function Model_SortBestPaperRankingsByRelevancy(llmResponse)
{
    //saftey check: we need to make sure we have what we need, otherwise we will have issues/errors!
    if (!llmResponse || !bestPaperRankings || bestPaperRankings.length === 0)
        return; //don't continue if we don't have what we need

    //parse "46, 8, 24" → [46, 8, 24]
    const orderedIndices = llmResponse
        .split(',')
        .map(x => parseInt(x.trim()))
        .filter(x => !isNaN(x));

    //build lookup map
    const proxyMap = new Map();

    for (let i = 0; i < bestPaperRankings.length; i++)
    {
        const proxy = bestPaperRankings[i];
        proxyMap.set(proxy.originalPaperIndex, proxy);
    }

    //rebuild sorted array
    const sorted = [];

    for (let i = 0; i < orderedIndices.length; i++)
    {
        const index = orderedIndices[i];

        if (proxyMap.has(index))
        {
            sorted.push(proxyMap.get(index));
            proxyMap.delete(index); //prevent duplicates
        }
    }

    //append any missing items (fallback safety)
    for (const remaining of proxyMap.values())
    {
        sorted.push(remaining);
    }

    //replace original array
    bestPaperRankings = sorted;
}

//||||||||||||||||||| PROMPT BUILDERS |||||||||||||||||||
//||||||||||||||||||| PROMPT BUILDERS |||||||||||||||||||
//||||||||||||||||||| PROMPT BUILDERS |||||||||||||||||||
//these construct prompts that we can send to an LLM to get what we need

//inital user prompt data extraction query
//we will tell the llm based on the users response
//extract important information from their natrual language response
function Model_ConstructInitialSearchPrompt(userPrompt)
{
    let finalPrompt = '';
    finalPrompt += 'given this users response "' + userPrompt + '" ';
    finalPrompt += 'please do your best to extract relevant keywords, URLs, authors, years to search a conference database. ';
    finalPrompt += 'your response MUST be in the following format... ';
    finalPrompt += 'Keywords: [write relevant keywords word by word here] \n';
    finalPrompt += 'URLs: [write URLs here if specified] \n';
    finalPrompt += 'Authors: [write authors here if specified] \n';
    finalPrompt += 'Years: [write years here if specified] \n';
    finalPrompt += 'For example... ';
    finalPrompt += 'Keywords: Collision Physics Polygon \n';
    finalPrompt += 'URLs: None \n';
    finalPrompt += 'Authors: None \n';
    finalPrompt += 'Years: None \n';
    finalPrompt += 'if nothing is specified, just write None on each of the fields';
    return finalPrompt;
}

//refinement prompt query
//we will tell the llm based on the users response
//and also the best scoring paper rankings, to sort it again by relevancy
//this time actually providing the title/abstracts
function Model_ConstructRefinementSearchPrompt(userPrompt, results)
{
    let finalPrompt = '';
    finalPrompt += 'given this users original response "' + userPrompt + '" ';
    finalPrompt += 'and the following candidate research papers... ';

    for (let i = 0; i < results.length; i++)
    {
        const paperRank = results[i];
        const paper = originalPapers[paperRank.originalPaperIndex];
        finalPrompt += 'Title: '             + (paper.title    || '') + '\n';
        finalPrompt += 'Abstract: '          + (paper.abstract || '') + '\n';
        finalPrompt += 'OriginalArrayIndex: ' + paperRank.originalPaperIndex + '\n\n';
    }

    finalPrompt += 'task:\n';
    finalPrompt += 'sort these papers by relevance to the user query.\n';
    finalPrompt += 'return ONLY a comma-separated list of OriginalArrayIndex values.\n';
    finalPrompt += 'do NOT include explanations, text, or formatting.\n\n';
    finalPrompt += 'example:\n';
    finalPrompt += '46, 8, 24\n';
    return finalPrompt;
}

//||||||||||||||||||| LLM / AI |||||||||||||||||||
//||||||||||||||||||| LLM / AI |||||||||||||||||||
//||||||||||||||||||| LLM / AI |||||||||||||||||||
//handle post/get request with googel gemni llm

async function Model_RequestLLM(llmPrompt)
{
    //important saftey check: by this point if we don't have the API key for whatever reason (we should)
    //then we can't continue!
    if (!setup_apiKey)
        throw new Error("Missing API key.");

    const finalURL = `${urlLLM}?key=${setup_apiKey}`;

    const response = await fetch(finalURL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
        contents: [{ parts: [{ text: llmPrompt }] }]
        })
    });

    if (!response.ok)
        throw new Error(`HTTP ${response.status}`);

    const data = await response.json();

    return data?.candidates?.[0]?.content?.parts?.[0]?.text || "No response from model.";
}

//||||||||||||||||||| HELPERS |||||||||||||||||||
//||||||||||||||||||| HELPERS |||||||||||||||||||
//||||||||||||||||||| HELPERS |||||||||||||||||||
//utility string helper functions

function HelperExtractField(llmResponse, label)
{
    const regex = new RegExp(`${label}:\\s*(.*)`, 'i');
    const match = llmResponse.match(regex);
    return match ? match[1].trim() : null;
}

function HelperCleanupText(text)
{
    return (text || '')
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function HelperNormalizeText(text)
{
    return (text || '')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '')
        .trim();
}

function HelperSplitKeywordsToArray(text)
{
    if (!text || text.toLowerCase() === 'none') 
        return null;

    return text.split(/\s+/).filter(x => x.length > 0);
}