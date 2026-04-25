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
let bestPaperRankingsHTML = [];

//||||||||||||||||||| APPLICATION CONST VARIABLES |||||||||||||||||||
//||||||||||||||||||| APPLICATION CONST VARIABLES |||||||||||||||||||
//||||||||||||||||||| APPLICATION CONST VARIABLES |||||||||||||||||||
//NOTE: these should not change at runtime, they are constant

const applicationStateSetupCode = 0;
const applicationStateIdleCode = 1;
const applicationStateErrorCode = 2;
const applicationStateProcessingCode = 3;
const applicationStateSearchSuccess = 4;
const applicationStateSearchFail = 5;

//these are weights that can be adjusted manually
//these get used during filtering so if we end up with a large amount of results
//we can use these to help sort the filtered collection
//thereby picking the best of the bunch that we can send off to the LLM for final ranking
const filterTitleWeight = 5;
const filterAbstractWeight = 2;
const filterAuthorWeight = 3;
const filterYearWeight = 4;
const filterURLWeight = 10;

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

//||||||||||||||||||| HTML ELEMENTS |||||||||||||||||||
//||||||||||||||||||| HTML ELEMENTS |||||||||||||||||||
//||||||||||||||||||| HTML ELEMENTS |||||||||||||||||||

const pageSetup = document.getElementById('page-setup');
const pageMain  = document.getElementById('page-main');

const inputCsvFile = document.getElementById('input-csv-file');
const inputApiKey  = document.getElementById('input-api-key');
const inputSearch  = document.getElementById('input-search');

const imageLogo             = document.getElementById('image-logo');
const imageApplicationState = document.getElementById('image-application-state');

const buttonSetup  = document.getElementById('button-setup');
const buttonSearch = document.getElementById('button-search');

const containerApplicationState      = document.getElementById('container-application-state');
const containerApplicationStatePanel = document.getElementById('container-application-state-panel');
const containerResults               = document.getElementById('container-results');

const textApplicationState = document.getElementById('text-application-state');
const textUploadFilename   = document.getElementById('text-upload-filename');
const textResults          = document.getElementById('text-results');

//template
const templateContainer    = document.getElementById('container-result-element-template');
const templateTextTitle    = document.getElementById('text-result-element-title-template');
const templateTextAuthor   = document.getElementById('text-result-element-author-template');
const templateTextYear     = document.getElementById('text-result-element-year-template');
const templateTextURL      = document.getElementById('text-result-element-url-template');
const templateTextAbstract = document.getElementById('text-result-element-abstract-template');

//||||||||||||||||||| HTML LISTENERS |||||||||||||||||||
//||||||||||||||||||| HTML LISTENERS |||||||||||||||||||
//||||||||||||||||||| HTML LISTENERS |||||||||||||||||||

inputCsvFile.addEventListener('change', ChangeCSV);
buttonSetup.addEventListener('click', SetupApplication);
buttonSearch.addEventListener('click', Search);

//||||||||||||||||||| MAIN - SETUP |||||||||||||||||||
//||||||||||||||||||| MAIN - SETUP |||||||||||||||||||
//||||||||||||||||||| MAIN - SETUP |||||||||||||||||||

async function SetupApplication()
{
  setupComplete = false;

  SetApplicationState(applicationStateSetupCode, 'Setup application...');

  const file = inputCsvFile.files[0];
  const apiKey = inputApiKey.value.trim();

  if (!file) 
  {
    SetApplicationState(applicationStateErrorCode, 'Please select a CSV file!');
    return;
  }

  if (!file.name.endsWith('.csv')) 
  {
    SetApplicationState(applicationStateErrorCode, 'File must be a .csv!');
    return;
  }

  if (!apiKey) 
  {
    SetApplicationState(applicationStateErrorCode, 'Please enter an API key!');
    return;
  }

  //save basic state
  setup_csvFilename = file.name;
  setup_apiKey = apiKey;

  SetApplicationState(applicationStateSetupCode, 'Reading CSV file...');

  try 
  {
    const csvFileText = await file.text();
    ParseCSV(csvFileText);
    setupComplete = true;
    SetApplicationState(applicationStateIdleCode, `Setup complete! Loaded ${originalPapers.length} entries from ${setup_csvFilename}`);
  } 
  catch (error) 
  {
    console.error(error);
    const message = error?.message || 'Unknown error occurred';
    SetApplicationState(applicationStateErrorCode, `Failed to read CSV file: ${message}`);
  }
}

//||||||||||||||||||| MAIN - SEARCH |||||||||||||||||||
//||||||||||||||||||| MAIN - SEARCH |||||||||||||||||||
//||||||||||||||||||| MAIN - SEARCH |||||||||||||||||||

function ConstructInitalSearchPromptForLLM(originalUserPrompt)
{
  let finalPrompt = '';

  finalPrompt += 'Given this users response "';
  finalPrompt += originalUserPrompt;
  finalPrompt += '" ';
  finalPrompt += 'Please do your best to extract relevant keywords, URLs, authors, years to search a conference database. ';
  finalPrompt += 'Your response MUST be in the following format... ';
  finalPrompt += 'Keywords: [write relevant keywords word by word here] \n';
  finalPrompt += 'URLs: [write URLs here if specified] \n';
  finalPrompt += 'Authors: [write authors here if specified] \n';
  finalPrompt += 'Years: [write years here if specified] \n';
  finalPrompt += 'For example... ';
  finalPrompt += 'Keywords: Collision Physics Polygon \n';
  finalPrompt += 'URLs: None \n';
  finalPrompt += 'Authors: None \n';
  finalPrompt += 'Years: None \n';
  finalPrompt += 'If nothing is specified, just write None on each of the fields';

  return finalPrompt;
}

async function Search()
{
  //get user input
  const prompt = inputSearch.value.trim();
  currentUserPrompt = prompt;

  if (!prompt) 
  {
    SetApplicationState(applicationStateErrorCode, "Please enter a search query.");
    return;
  }

  const llmPrompt = ConstructInitalSearchPromptForLLM(prompt);

  SetApplicationState(applicationStateProcessingCode, "Searching papers...");

  try
  {
    //call LLM
    const result = await RequestLLM(llmPrompt);

    SetApplicationState(applicationStateIdleCode, "Inital search complete.");
    FilterPaperSearch(result);

    let resultsText = 'We found ';
    resultsText += bestPaperRankings.length;
    resultsText += ' best results that match your query. ';
    resultsText += 'If you wait a bit we will check these articles and order them by relevancy...';
    UpdateResultsText(resultsText);
    
    //final refinement (sort by relevancy)
    await RefinePaperSearch();
  }
  catch (error)
  {
    console.error(error);
    SetApplicationState(applicationStateErrorCode, `Inital search failed! ${error.message}`);
  }
}

//||||||||||||||||||| CSV |||||||||||||||||||
//||||||||||||||||||| CSV |||||||||||||||||||
//||||||||||||||||||| CSV |||||||||||||||||||

function ChangeCSV()
{
  const file = inputCsvFile.files[0];

  if (file) 
  {
    if(textUploadFilename) //saftey check: make sure element exists before we do anything with it
      textUploadFilename.textContent = `Selected: ${file.name}`;
  }
}

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

    if (char === '"' ) 
    {
      //handle escaped quotes ""
      if (inQuotes && nextChar === '"') {
        current += '"';
        i++; // skip next
      } else {
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
      if (current || row.length > 0) {
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
  if (current || row.length > 0) {
    row.push(current);
    rows.push(row);
  }

  if (rows.length === 0) {
    throw new Error("Empty CSV");
  }

  //first row = headers
  originalCSVHeaders = [];
  originalCSVHeaders = rows[0].map(h => h.trim().toLowerCase());

  //remaining rows = data
  originalPapers = [];

  for (let i = 1; i < rows.length; i++) 
  {
    ParseCSVElementToPaperObject(rows[i]);
  }

  RemoveDuplicatesPapersFromList();
}

function ParseCSVElementToPaperObject(values)
{
  let obj = {};

  //map using headers (this ensures we get what we need even if column order changes)
  originalCSVHeaders.forEach((header, i) => {
    obj[header] = values[i]?.trim() || '';
  });

  const paper = {
    title: obj.title || '',
    url: obj.url || '',
    authors: obj.authors || '',
    abstract: obj.abstract || '',
    citation: obj.citation || '',
    year: obj.year || obj.years || ''
  };

  originalPapers.push(paper);
}

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

    //build a dedupe key
    let key = '';

    if (paper.url) //URLS are always the strongest identifier, prioritize them!
      key = HelperNormalizeText(paper.url);
    else
    {
      //otherwise for whatever reason if we don't have a URL
      //then we can construct a fallback using title/year/abstract
      const title = HelperNormalizeText(paper.title);
      const year  = HelperNormalizeText(paper.year);
      const abstract = HelperNormalizeText(paper.abstract).substring(0, 100); //partial for safety
      key = title + '|' + year + '|' + abstract;
    }

    if (!seen.has(key))
    {
      seen.add(key);
      unique.push(paper);
    }
  }

  originalPapers = unique;
}

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
    score: 0,
    titleMatches: 0,
    abstractMatches: 0,
    authorMatches: 0,
    yearMatches: 0,
    urlMatches: 0
  };

  paperRankings.push(paperRank);
}

//calculate the score for a paper rank based on the matches
function CalculateScoreForPaperRanking(paperRank)
{
  return (
    paperRank.titleMatches * filterTitleWeight +
    paperRank.abstractMatches * filterAbstractWeight +
    paperRank.authorMatches * filterAuthorWeight +
    paperRank.yearMatches * filterYearWeight +
    paperRank.urlMatches * filterURLWeight
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
  if (!keywords || keywords.length === 0)
    return; //do nothing

  const normalizedKeywords = keywords.map(k => HelperCleanupText(k));

  for (let i = 0; i < paperRankings.length; i++)
  {
    const paperRank = paperRankings[i];
    const paper = originalPapers[paperRank.originalPaperIndex];
    const title = HelperCleanupText(paper.title);
    const abstract = HelperCleanupText(paper.abstract);

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
  if (!urls || urls.length === 0)
    return; //do nothing

  for (let i = 0; i < paperRankings.length; i++)
  {
    const paperRank = paperRankings[i];
    const paper = originalPapers[paperRank.originalPaperIndex];
    const url = paper.url;

    for (let k = 0; k < urls.length; k++)
    {
      const keyword = urls[k];

      if (url.includes(keyword))
        paperRank.urlMatches++;
    }
  }
}

//given authors (if there are any)
//go through the paper rankings to find out how many author matches there are
function RankPapersByAuthors(authors = null)
{
  if (!authors || authors.length === 0)
    return; //do nothing

  const normalizedKeywords = authors.map(k => HelperCleanupText(k));

  for (let i = 0; i < paperRankings.length; i++)
  {
    const paperRank = paperRankings[i];
    const paper = originalPapers[paperRank.originalPaperIndex];
    const authors = HelperCleanupText(paper.authors);

    for (let k = 0; k < normalizedKeywords.length; k++)
    {
      const keyword = normalizedKeywords[k];

      if (authors.includes(keyword))
        paperRank.authorMatches++;
    }
  }
}

//given years (if there are any)
//go through the paper rankings to find out how many year matches there are
function RankPapersByYears(years = null)
{
  if (!years || years.length === 0)
    return; //do nothing

  for (let i = 0; i < paperRankings.length; i++)
  {
    const paperRank = paperRankings[i];
    const paper = originalPapers[paperRank.originalPaperIndex];
    const year = paper.year;

    for (let k = 0; k < years.length; k++)
    {
      const keyword = years[k];

      if (year.includes(keyword))
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

    //only meaningful results
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

//given a response from the LLM which will extract relevant data 
function FilterPaperSearch(llmResponse)
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
      .filter(y => /^\d+$/.test(y)); //only numbers
  }

  RankPapersByKeywords(responseKeywords);
  RankPapersByURLs(responseURLs);
  RankPapersByAuthors(responseAuthors);
  RankPapersByYears(responseYears);

  PrunePaperRankings();
  SortPaperRankingsByScore();
  GetBestPaperRankings();
}

function GetBestPaperRankings()
{
  bestPaperRankings = [];

  const limit = Math.min(filterMaxRefinementCount, paperRankings.length);

  for (let i = 0; i < limit; i++)
  {
    bestPaperRankings.push(paperRankings[i]);
  }
}

//||||||||||||||||||| REFINE FILTERING |||||||||||||||||||
//||||||||||||||||||| REFINE FILTERING |||||||||||||||||||
//||||||||||||||||||| REFINE FILTERING |||||||||||||||||||

function ConstructRefinementSearchPromptForLLM(originalUserPrompt, bestResults)
{
  let finalPrompt = '';

  finalPrompt += 'given this users original response "';
  finalPrompt += originalUserPrompt;
  finalPrompt += '" ';
  finalPrompt += 'and the following candidate research papers... ';

  for (let i = 0; i < bestResults.length; i++)
  {
    const paperRank = bestResults[i];
    const paper = originalPapers[paperRank.originalPaperIndex];

    finalPrompt += 'Title: ';
    finalPrompt += paper.title || '';
    finalPrompt += '\n';

    finalPrompt += 'Abstract: ';
    finalPrompt += paper.abstract || '';
    finalPrompt += '\n';

    finalPrompt += 'OriginalArrayIndex: ';
    finalPrompt += paperRank.originalPaperIndex;
    finalPrompt += '\n';

    finalPrompt += '\n';
  }

  finalPrompt += 'task:\n';
  finalPrompt += 'sort these papers by relevance to the user query.\n';
  finalPrompt += 'return ONLY a comma-separated list of OriginalArrayIndex values.\n';
  finalPrompt += 'do NOT include explanations, text, or formatting.\n\n';

  finalPrompt += 'example:\n';
  finalPrompt += '46, 8, 24\n';

  return finalPrompt;
}

function SortBestPaperRankingsByRelevancy(llmResponse)
{
  if (!llmResponse || !bestPaperRankings || bestPaperRankings.length === 0)
    return;

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

async function RefinePaperSearch()
{
  const llmPrompt = ConstructRefinementSearchPromptForLLM(currentUserPrompt, bestPaperRankings);

  SetApplicationState(applicationStateProcessingCode, "Refining search...");

  try
  {
    //call LLM
    const result = await RequestLLM(llmPrompt);

    SetApplicationState(applicationStateIdleCode, "Refinement complete.");

    SortBestPaperRankingsByRelevancy(result);

    let resultsText = 'We found ';
    resultsText += bestPaperRankings.length;
    resultsText += ' best results that match your query. ';
    resultsText += 'Ranked in order of relevancy (highest to lowest).';
    UpdateResultsText(resultsText);

    if(bestPaperRankings.length > 0)
      SetApplicationState(applicationStateSearchSuccess, "Found articles!");
    else
      SetApplicationState(applicationStateSearchFail, "Nothing found!");
  }
  catch (error)
  {
    console.error(error);
    SetApplicationState(applicationStateIdleCode, `Refinement Search failed, falling back to scoring. Reason: ${error.message}`);
  }
}

//||||||||||||||||||| LLM / AI |||||||||||||||||||
//||||||||||||||||||| LLM / AI |||||||||||||||||||
//||||||||||||||||||| LLM / AI |||||||||||||||||||

//const urlLLM = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
//const urlLLM = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent';
const urlLLM = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent';

async function RequestLLM(llmPrompt)
{
  if (!setup_apiKey)
    throw new Error("Missing API key.");

  const finalURL = `${urlLLM}?key=${setup_apiKey}`;

  try
  {
    const response = await fetch(finalURL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: llmPrompt }
            ]
          }
        ]
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const data = await response.json();

    const output =
      data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "No response from model.";

    //back to idle
    SetApplicationState(applicationStateIdleCode, null);

    return output;
  }
  catch (error)
  {
    console.error(error);
    SetApplicationState(applicationStateErrorCode, `LLM request failed: ${error.message}`);
    throw error;
  }
}

//||||||||||||||||||| UI |||||||||||||||||||
//||||||||||||||||||| UI |||||||||||||||||||
//||||||||||||||||||| UI |||||||||||||||||||

function SetApplicationState(code, message = null)
{
  currentApplicationStateCode = code;

  if (message)
  {
    if(textApplicationState) //saftey check: make sure element exists before we do anything with it
      textApplicationState.textContent = message;
  }

  UpdateUI();
}

function UpdateResultsText(text)
{
  if(textResults) //saftey check: make sure element exists before we do anything with it
    textResults.textContent = text;
}

function UpdateUI()
{
  if(imageApplicationState) //saftey check: make sure element exists before we do anything with it
    imageApplicationState.src = applicationStateImagePaths[currentApplicationStateCode];

  if(containerApplicationStatePanel) //saftey check: make sure element exists before we do anything with it
    containerApplicationStatePanel.className = containerApplicationStatePanelClasses[currentApplicationStateCode];
  
  if(setupComplete)
  {
    pageSetup.style.display = 'none';
    pageMain.style.display = 'block';
  }
  else
  {
    pageSetup.style.display = 'block';
    pageMain.style.display = 'none';
  }

  //hide template
  templateContainer.style.display = 'none';
  templateTextTitle.style.display = 'none';
  templateTextAuthor.style.display = 'none';
  templateTextYear.style.display = 'none';
  templateTextURL.style.display = 'none';
  templateTextAbstract.style.display = 'none';

  ClearPaperRankingsHTML();
  CreatePaperRankingsHTML();
}

function CreatePaperRankingsHTML()
{
  if (!bestPaperRankings || bestPaperRankings.length === 0)
    return;

  bestPaperRankingsHTML = [];

  for (let i = 0; i < bestPaperRankings.length; i++)
  {
    CreatePaperRankHTML(bestPaperRankings[i]);
  }
}

function ClearPaperRankingsHTML()
{
  if (!bestPaperRankingsHTML || bestPaperRankingsHTML.length === 0)
    return;

  for (let i = 0; i < bestPaperRankingsHTML.length; i++)
  {
    DestroyPaperRankHTML(bestPaperRankingsHTML[i]);
  }

  bestPaperRankingsHTML = [];
}

function CreatePaperRankHTML(paperRank)
{
  if (!templateContainer) 
    return;

  //clone full container and it's children
  const clonedContainer = templateContainer.cloneNode(true);

  //remove template ID so duplicates don't conflict
  clonedContainer.removeAttribute('id');

  //get cloned children
  const clonedTextElementTitle    = clonedContainer.querySelector('#text-result-element-title-template');
  const clonedTextElementAuthor   = clonedContainer.querySelector('#text-result-element-author-template');
  const clonedTextElementYear     = clonedContainer.querySelector('#text-result-element-year-template');
  const clonedTextElementURL      = clonedContainer.querySelector('#text-result-element-url-template');
  const clonedTextElementAbstract = clonedContainer.querySelector('#text-result-element-abstract-template');

  //unhide (because by default the templates are hidden)
  clonedContainer.style.display = 'block';
  clonedTextElementTitle.style.display = 'block';
  clonedTextElementAuthor.style.display = 'block';
  clonedTextElementYear.style.display = 'block';
  clonedTextElementURL.style.display = 'block';
  clonedTextElementAbstract.style.display = 'block';

  //remove IDs from cloned children too
  clonedTextElementTitle?.removeAttribute('id');
  clonedTextElementAuthor?.removeAttribute('id');
  clonedTextElementYear?.removeAttribute('id');
  clonedTextElementURL?.removeAttribute('id');
  clonedTextElementAbstract?.removeAttribute('id');

  //get actual data
  const paper = originalPapers[paperRank.originalPaperIndex];

  //update text fields
  if (clonedTextElementTitle) //saftey check: make sure element exists before we do anything with it
    clonedTextElementTitle.textContent = 'Title: ' + paper.title || 'Title: Untitled';

  if (clonedTextElementAuthor) //saftey check: make sure element exists before we do anything with it
    clonedTextElementAuthor.textContent = 'Author: ' + paper.authors || 'Author: Unknown authors';

  if (clonedTextElementYear) //saftey check: make sure element exists before we do anything with it
    clonedTextElementYear.textContent = 'Year: ' + paper.year || 'Year: Unknown';

  if (clonedTextElementURL) //saftey check: make sure element exists before we do anything with it
  {
    clonedTextElementURL.textContent = paper.url || '';
    clonedTextElementURL.href = paper.url || '#';
  }

  if (clonedTextElementAbstract) //saftey check: make sure element exists before we do anything with it
    clonedTextElementAbstract.textContent = 'Abstract: ' + (paper.abstract || ''); // truncate optional

  //apply results to container
  containerResults.appendChild(clonedContainer);

  //store html reference
  const paperRankHTML = 
  {
    container: clonedContainer
  };

  bestPaperRankingsHTML.push(paperRankHTML);
}

function DestroyPaperRankHTML(paperRankHTML)
{
  if (!paperRankHTML) 
    return;

  const container = paperRankHTML.container;

  if (container && container.parentNode)
    container.parentNode.removeChild(container);
}

//||||||||||||||||||| HELPERS |||||||||||||||||||
//||||||||||||||||||| HELPERS |||||||||||||||||||
//||||||||||||||||||| HELPERS |||||||||||||||||||

//extract line value
function HelperExtractField(llmResponse, label)
{
  const regex = new RegExp(`${label}:\\s*(.*)`, 'i');
  const match = llmResponse.match(regex);
  return match ? match[1].trim() : null;
}

//cleanup (lowercase and remove punctuation)
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
    .replace(/[^a-z0-9]/g, '') //no spaces
    .trim();
}

//split into array
function HelperSplitKeywordsToArray(text)
{
  if (!text || text.toLowerCase() === 'none') 
    return null;
  
  return text.split(/\s+/).filter(x => x.length > 0);
}

//||||||||||||||||||| WEBSITE START |||||||||||||||||||
//||||||||||||||||||| WEBSITE START |||||||||||||||||||
//||||||||||||||||||| WEBSITE START |||||||||||||||||||

SetApplicationState(applicationStateSetupCode, 'Setup application...');