//||||||||||||||||||| APPLICATION DYNAMIC VARIABLES |||||||||||||||||||
//||||||||||||||||||| APPLICATION DYNAMIC VARIABLES |||||||||||||||||||
//||||||||||||||||||| APPLICATION DYNAMIC VARIABLES |||||||||||||||||||
//NOTE: these will change at runtime

let setup_csvFilename = '';
let setup_apiKey = '';
let setupComplete = false;

let currentApplicationStateCode = 0;
let currentUserPrompt = '';
let originalCSVEntries = 0;
let originalCSVData = [];
let originalCSVHeaders = [];
let currentFilteredCSVs = [];
let currentFilteredCSVsCount = 0;
let currentBestResults = [];
let currentBestResultsCount = 0;
let currentResultElementsHTML = [];

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

const containerApplicationState = document.getElementById('container-application-state');
const containerResults          = document.getElementById('container-results');

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

buttonSetup.addEventListener('click', SetupApplication);
inputCsvFile.addEventListener('change', ChangeCSV);
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
    SetApplicationState(applicationStateErrorCode, '❌ Please select a CSV file!');
    return;
  }

  if (!file.name.endsWith('.csv')) 
  {
    SetApplicationState(applicationStateErrorCode, '❌ File must be a .csv!');
    return;
  }

  if (!apiKey) 
  {
    SetApplicationState(applicationStateErrorCode, '❌ Please enter an API key!');
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
    SetApplicationState(applicationStateIdleCode, `✅ Setup complete! Loaded ${originalCSVEntries} entries from ${setup_csvFilename}`);
  } 
  catch (error) 
  {
    console.error(error);
    const message = error?.message || 'Unknown error occurred';
    SetApplicationState(applicationStateErrorCode, `❌ Failed to read CSV file: ${message}`);
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
    SetApplicationState(applicationStateErrorCode, "❌ Please enter a search query.");
    return;
  }

  const llmPrompt = ConstructInitalSearchPromptForLLM(prompt);

  SetApplicationState(applicationStateProcessingCode, "⏳ Searching papers...");

  try
  {
    //call LLM
    const result = await RequestLLM(llmPrompt);

    SetApplicationState(applicationStateIdleCode, "✅ Search complete.");
    FilterCSV(result);

    let resultsText = 'We found ';
    resultsText += currentBestResultsCount;
    resultsText += ' best results that match your query.';
    UpdateResultText(resultsText);

    if(currentBestResultsCount > 0)
      SetApplicationState(applicationStateSearchSuccess, "✅ Found articles!");
    else
      SetApplicationState(applicationStateSearchFail, "❌ Nothing found!");
  }
  catch (error)
  {
    console.error(error);
    SetApplicationState(applicationStateErrorCode, `❌ Search failed: ${error.message}`);
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
      // Handle escaped quotes ""
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

  // Push last value
  if (current || row.length > 0) {
    row.push(current);
    rows.push(row);
  }

  if (rows.length === 0) {
    throw new Error("Empty CSV");
  }

  // First row = headers
  originalCSVHeaders = [];
  originalCSVHeaders = rows[0].map(h => h.trim().toLowerCase());

  // Remaining rows = data
  originalCSVData = [];
  for (let i = 1; i < rows.length; i++) {
    ParseCSVElement(rows[i]);
  }

  originalCSVEntries = originalCSVData.length;
}

function ParseCSVElement(values)
{
  let obj = {};

  //map using headers
  //(this ensures we get what we need even if column order changes)
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

  originalCSVData.push(paper);
}

function ResetFiltering()
{
  currentFilteredCSVs = [];
  currentFilteredCSVsCount = 0;
  currentBestResults = [];
  currentBestResultsCount = 0;
}

function CreateFilterArray()
{
  for (let i = 0; i < originalCSVData.length; i++)
  {
    CreateFilterElementProxy(i);
  }

  currentFilteredCSVsCount = currentFilteredCSVs.length;
}

function CreateFilterElementProxy(originalElementIndex)
{
  const proxy = {
    CSVArrayIndex: originalElementIndex,
    score: 0,
    titleMatches: 0,
    abstractMatches: 0,
    authorMatches: 0,
    yearMatches: 0,
    urlMatches: 0
  };

  currentFilteredCSVs.push(proxy);
}

function CalculateScoreForFilterElement(proxy)
{
  return (
    proxy.titleMatches * filterTitleWeight +
    proxy.abstractMatches * filterAbstractWeight +
    proxy.authorMatches * filterAuthorWeight +
    proxy.yearMatches * filterYearWeight +
    proxy.urlMatches * filterURLWeight
  );
}

//||||||||||||||||||| INITAL FILTERING |||||||||||||||||||
//||||||||||||||||||| INITAL FILTERING |||||||||||||||||||
//||||||||||||||||||| INITAL FILTERING |||||||||||||||||||

function FilterEntriesByKeywords(keywords = null)
{
  if (!keywords || keywords.length === 0)
    return; //do nothing

  const normalizedKeywords = keywords.map(k => HelperCleanupText(k));

  for (let i = 0; i < currentFilteredCSVs.length; i++)
  {
    const proxy = currentFilteredCSVs[i];
    const paper = originalCSVData[proxy.CSVArrayIndex];
    const title = HelperCleanupText(paper.title);
    const abstract = HelperCleanupText(paper.abstract);

    for (let k = 0; k < normalizedKeywords.length; k++)
    {
      const keyword = normalizedKeywords[k];

      if (title.includes(keyword))
        proxy.titleMatches += 1;

      if (abstract.includes(keyword))
        proxy.abstractMatches += 1;
    }
  }
}

function FilterEntriesByURLs(urls = null)
{
  if (!urls || urls.length === 0)
    return; //do nothing

  for (let i = 0; i < currentFilteredCSVs.length; i++)
  {
    const proxy = currentFilteredCSVs[i];
    const paper = originalCSVData[proxy.CSVArrayIndex];
    const url = paper.url;

    for (let k = 0; k < urls.length; k++)
    {
      const keyword = urls[k];

      if (url.includes(keyword))
        proxy.urlMatches += 1;
    }
  }
}

function FilterEntriesByAuthors(authors = null)
{
  if (!authors || authors.length === 0)
    return; //do nothing

  const normalizedKeywords = authors.map(k => HelperCleanupText(k));

  for (let i = 0; i < currentFilteredCSVs.length; i++)
  {
    const proxy = currentFilteredCSVs[i];
    const paper = originalCSVData[proxy.CSVArrayIndex];
    const authors = HelperCleanupText(paper.authors);

    for (let k = 0; k < normalizedKeywords.length; k++)
    {
      const keyword = normalizedKeywords[k];

      if (authors.includes(keyword))
        proxy.authorMatches += 1;
    }
  }
}

function FilterEntriesByYears(years = null)
{
  if (!years || years.length === 0)
    return; //do nothing

  for (let i = 0; i < currentFilteredCSVs.length; i++)
  {
    const proxy = currentFilteredCSVs[i];
    const paper = originalCSVData[proxy.CSVArrayIndex];
    const year = paper.year;

    for (let k = 0; k < years.length; k++)
    {
      const keyword = years[k];

      if (year.includes(keyword))
        proxy.yearMatches += 1;
    }
  }
}

function SimplifyFilteredCSV()
{
  const simplified = [];

  for (let i = 0; i < currentFilteredCSVs.length; i++)
  {
    const proxy = currentFilteredCSVs[i];
    proxy.score = CalculateScoreForFilterElement(proxy);

    //only meaningful results
    if (proxy.score > 0)
      simplified.push(proxy);
  }

  currentFilteredCSVs = simplified;
  currentFilteredCSVsCount = currentFilteredCSVs.length;
}

function SortFilteredCSV()
{
  currentFilteredCSVs.sort((a, b) => b.score - a.score);
}

function FilterCSV(llmResponse)
{
  ResetFiltering();
  CreateFilterArray();

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
      .filter(y => /^\d+$/.test(y)); // only numbers
  }

  console.log({
    responseKeywords,
    responseURLs,
    responseAuthors,
    responseYears
  });

  FilterEntriesByKeywords(responseKeywords);
  FilterEntriesByURLs(responseURLs);
  FilterEntriesByAuthors(responseAuthors);
  FilterEntriesByYears(responseYears);

  SimplifyFilteredCSV(); //remove entries that have no matches
  SortFilteredCSV(); //sort entries by the best scores
  CollectBestFilteredCSVs(); //get only the best ones
}

function CollectBestFilteredCSVs()
{
  currentBestResults = [];

  const limit = Math.min(filterMaxRefinementCount, currentFilteredCSVs.length);

  for (let i = 0; i < limit; i++)
  {
    currentBestResults.push(currentFilteredCSVs[i]);
  }

  currentBestResultsCount = currentBestResults.length;
}

//||||||||||||||||||| REFINE FILTERING |||||||||||||||||||
//||||||||||||||||||| REFINE FILTERING |||||||||||||||||||
//||||||||||||||||||| REFINE FILTERING |||||||||||||||||||

function ConstructRefinementSearchPromptForLLM(originalUserPrompt, bestResults)
{
  let finalPrompt = '';

  finalPrompt += 'Given this users original response "';
  finalPrompt += originalUserPrompt;
  finalPrompt += '" ';
  finalPrompt += 'And the following candidate research papers... ';

  for (let i = 0; i < bestResults.length; i++)
  {
    const proxy = bestResults[i];
    const paper = originalCSVData[proxy.CSVArrayIndex];

    finalPrompt += 'Title: ';
    finalPrompt += paper.title || '';
    finalPrompt += '\n';

    finalPrompt += 'Abstract: ';
    finalPrompt += paper.abstract || '';
    finalPrompt += '\n';

    finalPrompt += 'OriginalArrayIndex: ';
    finalPrompt += proxy.CSVArrayIndex;
    finalPrompt += '\n';

    finalPrompt += '\n';
  }

  finalPrompt += 'Task:\n';
  finalPrompt += 'Sort these papers by relevance to the user query.\n';
  finalPrompt += 'Return ONLY a comma-separated list of OriginalArrayIndex values.\n';
  finalPrompt += 'Do NOT include explanations, text, or formatting.\n\n';

  finalPrompt += 'Example output:\n';
  finalPrompt += '46, 8, 24\n';

  return finalPrompt;
}

function SortFilteredCSVsByRelevancy()
{
  //currentBestResults = [];
  //currentBestResultsCount = currentBestResults.length;
  //currentUserPrompt

  /*

  */
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
    SetApplicationState(applicationStateErrorCode, `❌ LLM request failed: ${error.message}`);
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

function UpdateResultText(text)
{
  if(textResults) //saftey check: make sure element exists before we do anything with it
    textResults.textContent = text;
}

function UpdateUI()
{
  if(imageApplicationState) //saftey check: make sure element exists before we do anything with it
    imageApplicationState.src = applicationStateImagePaths[currentApplicationStateCode];
  
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

  ClearResultsUI();
  CreateResultsUI();
}

function DestroyResultElementUI(resultElementHTML)
{
  if (!resultElementHTML) 
    return;

  const container = resultElementHTML.container;

  if (container && container.parentNode)
    container.parentNode.removeChild(container);
}

function CreateResultElementUI(referenceProxy)
{
  if (!templateContainer) 
    return;

  // Clone full container (deep clone)
  const containerClone = templateContainer.cloneNode(true);

  // Remove template ID so duplicates don't conflict
  containerClone.removeAttribute('id');

  // Query children inside clone (IMPORTANT: not global getElementById)
  const titleEl    = containerClone.querySelector('#text-result-element-title-template');
  const authorEl   = containerClone.querySelector('#text-result-element-author-template');
  const yearEl     = containerClone.querySelector('#text-result-element-year-template');
  const urlEl      = containerClone.querySelector('#text-result-element-url-template');
  const abstractEl = containerClone.querySelector('#text-result-element-abstract-template');

  //unhide
  containerClone.style.display = 'block';
  titleEl.style.display = 'block';
  authorEl.style.display = 'block';
  yearEl.style.display = 'block';
  urlEl.style.display = 'block';
  abstractEl.style.display = 'block';

  // Remove IDs from cloned children too
  titleEl?.removeAttribute('id');
  authorEl?.removeAttribute('id');
  yearEl?.removeAttribute('id');
  urlEl?.removeAttribute('id');
  abstractEl?.removeAttribute('id');

  // Get actual data
  const paper = originalCSVData[referenceProxy.CSVArrayIndex];

  // Populate text
  if (titleEl)
    titleEl.textContent = 'Title: ' + paper.title || 'Untitled';

  if (authorEl)
    authorEl.textContent = 'Author: ' + paper.authors || 'Unknown authors';

  if (yearEl)
    yearEl.textContent = 'Year: ' + paper.year || 'Unknown year';

  if (urlEl)
  {
    urlEl.textContent = paper.url || '';
    urlEl.href = paper.url || '#';
  }

  if (abstractEl)
    abstractEl.textContent = 'Abstract: ' + (paper.abstract || '').substring(0, 300); // truncate optional

  // Append to results container
  containerResults.appendChild(containerClone);

  // Store reference
  const resultElementHTML = {
    container: containerClone
  };

  currentResultElementsHTML.push(resultElementHTML);
}

function CreateResultsUI()
{
  if (!currentBestResults || currentBestResults.length === 0)
    return;

  currentResultElementsHTML = [];

  for (let i = 0; i < currentBestResults.length; i++)
  {
    CreateResultElementUI(currentBestResults[i]);
  }
}

function ClearResultsUI()
{
  if (!currentResultElementsHTML || currentResultElementsHTML.length === 0)
    return;

  for (let i = 0; i < currentResultElementsHTML.length; i++)
  {
    DestroyResultElementUI(currentResultElementsHTML[i]);
  }

  currentResultElementsHTML = [];
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

//split into array
function HelperSplitKeywordsToArray(str)
{
  if (!str || str.toLowerCase() === 'none') 
    return null;
  
  return str.split(/\s+/).filter(x => x.length > 0);
}

//||||||||||||||||||| WEBSITE START |||||||||||||||||||
//||||||||||||||||||| WEBSITE START |||||||||||||||||||
//||||||||||||||||||| WEBSITE START |||||||||||||||||||

SetApplicationState(applicationStateSetupCode, 'Setup application...');