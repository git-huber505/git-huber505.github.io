/*
This is the controller portion of our application.
it will call model for the main application logic
it will also call view so that the views reflect application state

NOTE: nothing in here should mess with the html document directly
if it does then it's not an MVC!!!!
*/

//||||||||||||||||||| EVENT LISTENERS |||||||||||||||||||
//||||||||||||||||||| EVENT LISTENERS |||||||||||||||||||
//||||||||||||||||||| EVENT LISTENERS |||||||||||||||||||
//hookup events to html elements

inputCsvFile.addEventListener('change', Controller_OnCSVChanged);
buttonSetup.addEventListener('click',   Controller_OnSetupClicked);
buttonSearch.addEventListener('click',  Controller_OnSearchClicked);

//||||||||||||||||||| HELPERS |||||||||||||||||||
//||||||||||||||||||| HELPERS |||||||||||||||||||
//||||||||||||||||||| HELPERS |||||||||||||||||||

//single source of truth for applying a state code to the View.
function Controller_ApplyState(code, message = null)
{
    Model_SetCurrentStateCode(code);

    if (message)
        View_SetStateMessage(message);

    View_SetStateImage(Model_GetStateImagePath(code));
    View_SetStatePanelClass(Model_GetStatePanelClass(code));

    if (Model_GetSetupComplete())
        View_ShowMainPage();
    else
        View_ShowSetupPage();

    //always keep templates hidden and sync result cards
    const papers = Model_GetBestPaperRankings().map(r => Model_GetPaperByIndex(r.originalPaperIndex));
    View_RenderResultCards(papers);
}

//||||||||||||||||||| CSV CHANGE |||||||||||||||||||
//||||||||||||||||||| CSV CHANGE |||||||||||||||||||
//||||||||||||||||||| CSV CHANGE |||||||||||||||||||

function Controller_OnCSVChanged()
{
    const file = View_GetCsvFile();

    if (file)
        View_SetUploadFilename(file.name);
}

//||||||||||||||||||| SETUP |||||||||||||||||||
//||||||||||||||||||| SETUP |||||||||||||||||||
//||||||||||||||||||| SETUP |||||||||||||||||||
//for when the user clicks "setup"
//this will setup the application accordingly
//assuming we have gave it a CSV file and an API key to work with

async function Controller_OnSetupClicked()
{
    Controller_ApplyState(applicationStateSetupCode, 'Setup application...');

    const file   = View_GetCsvFile();
    const apiKey = View_GetApiKey();

    try
    {
        Controller_ApplyState(applicationStateSetupCode, 'Reading CSV file...');
        const { count, filename } = await Model_Setup(file, apiKey);
        Controller_ApplyState(applicationStateIdleCode, `Setup complete! Loaded ${count} entries from ${filename}`);
    }
    catch (error)
    {
        console.error(error);
        Controller_ApplyState(applicationStateErrorCode, error.message || 'Unknown error occurred');
    }
}

//||||||||||||||||||| SEARCH |||||||||||||||||||
//||||||||||||||||||| SEARCH |||||||||||||||||||
//||||||||||||||||||| SEARCH |||||||||||||||||||
//given the user search prompt, we will query our database to find the most relevant papers

async function Controller_OnSearchClicked()
{
    const prompt = View_GetSearchQuery();

    if (!prompt)
    {
        Controller_ApplyState(applicationStateErrorCode, "Please enter a search query.");
        return;
    }

    Model_SetCurrentUserPrompt(prompt);
    Controller_ApplyState(applicationStateProcessingCode, "Searching papers...");

    try
    {
        //ask LLM to extract keywords/URLs/authors/years
        const initialPrompt = Model_ConstructInitialSearchPrompt(prompt);
        const initialResult = await Model_RequestLLM(initialPrompt);

        Controller_ApplyState(applicationStateIdleCode, "Initial search complete.");

        //then filter and rank papers locally
        const matchCount = Model_FilterPaperSearch(initialResult);

        View_SetResultsText(
        `We found ${matchCount} best results that match your query. ` +
        `If you wait a bit we will check these articles and order them by relevancy...`
        );

        //render preliminary results
        const preliminaryPapers = Model_GetBestPaperRankings().map(r => Model_GetPaperByIndex(r.originalPaperIndex));
        View_RenderResultCards(preliminaryPapers);

        //ask LLM to re-rank top results by relevancy
        await Controller_RefinePaperSearch(prompt);
    }
    catch (error)
    {
        console.error(error);
        Controller_ApplyState(applicationStateErrorCode, `Initial search failed! ${error.message}`);
    }
}

async function Controller_RefinePaperSearch(userPrompt)
{
    const bestRankings    = Model_GetBestPaperRankings();
    const refinementPrompt = Model_ConstructRefinementSearchPrompt(userPrompt, bestRankings);

    Controller_ApplyState(applicationStateProcessingCode, "Refining search...");

    try
    {
        const result = await Model_RequestLLM(refinementPrompt);

        Controller_ApplyState(applicationStateIdleCode, "Refinement complete.");

        Model_SortBestPaperRankingsByRelevancy(result);

        const sortedPapers = Model_GetBestPaperRankings().map(r => Model_GetPaperByIndex(r.originalPaperIndex));

        View_SetResultsText(
        `We found ${sortedPapers.length} best results that match your query. ` +
        `Ranked in order of relevancy (highest to lowest).`
        );

        View_RenderResultCards(sortedPapers);

        if (sortedPapers.length > 0)
            Controller_ApplyState(applicationStateSearchSuccess, "Found articles!");
        else
            Controller_ApplyState(applicationStateSearchFail, "Nothing found!");
    }
    catch (error)
    {
        console.error(error);
        Controller_ApplyState(applicationStateIdleCode, `Refinement failed, falling back to score order. Reason: ${error.message}`);
    }
}

//||||||||||||||||||| WEBSITE START |||||||||||||||||||
//||||||||||||||||||| WEBSITE STAR |||||||||||||||||||
//||||||||||||||||||| WEBSITE STAR |||||||||||||||||||

Controller_ApplyState(applicationStateSetupCode, 'Setup application...');