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
        //validate API key first!
        const apiError = await Model_CheckLLM(apiKey);

        if (apiError) 
            throw new Error(apiError);

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
        const initialPrompt = Model_ConstructInitialSearchPrompt(prompt); //this creates the prompt text
        const initialResult = await Model_RequestLLM(initialPrompt); //this actually sends the constructed prompt text to the LLM

        Controller_ApplyState(applicationStateIdleCode, "Initial search complete.");

        //then filter and rank papers locally
        const matchCount = Model_FilterPaperSearch(initialResult);

        //render preliminary results
        let bestPaperRankings = Model_GetBestPaperRankings();
        const preliminaryPapers = bestPaperRankings.map(r => Model_GetPaperByIndex(r.originalPaperIndex));
        View_RenderResultCards(preliminaryPapers);

        //if we don't have any papers to rank against, then no reason to refine search
        if(bestPaperRankings.length <= 0)
        {
            Controller_ApplyState(applicationStateSearchFail, "Nothing found!");
            View_SetResultsText(
            `No results were found! ` +
            `This could be due to the following... ` +
            `Your search prompt didn't indicate anything to actually search for. ` +
            `Or your search prompt was too specific for something that doesn't exist. ` +
            `Or potentially some application error occured. ` + 
            `Try again by changing your response to be something different! `
            );
            console.log("no articles found after inital search rankings, skipping refinement...");
            return; //don't continue, we didn't find any papers that matches the user search query unfortunately.
        }
        //if we don't have enough papers to rank against, no reason to waste resources/api request refining search results
        //we already found 1 that matched the users query anyway so nothing further needs to be done!
        else if(bestPaperRankings.length < 2)
        {
            Controller_ApplyState(applicationStateSearchSuccess, "Found article!");
            View_SetResultsText(
            `1 article was found that best matched your query!`
            );
            console.log("only 1 article found after inital search rankings, skipping refinement...");
            return; //don't continue, pointless to refine search on only just 1 paper only
        }
        //otherwise, we have more than 1 paper that we found, so lets do an additonal search refinement step
        else
        {
            View_SetResultsText(
            `Here are ${matchCount} articles we found that best match your search. ` +
            `If you wait a bit we will check these articles and order them by relevancy...`
            );

            //ask LLM to re-rank top results by relevancy
            await Controller_RefinePaperSearch(prompt);
        }
    }
    catch (error)
    {
        console.error(error);
        Controller_ApplyState(applicationStateErrorCode, `Initial search failed! (You could retry the search again) ${error.message}`);
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
        `Ranked in order of relevancy (from highest to lowest).`
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
        Controller_ApplyState(applicationStateIdleCode, `Refinement failed, falling back to score order. (You can retry the search again) Reason: ${error.message}`);
    }
}

//||||||||||||||||||| WEBSITE START |||||||||||||||||||
//||||||||||||||||||| WEBSITE START |||||||||||||||||||
//||||||||||||||||||| WEBSITE START |||||||||||||||||||

Controller_ApplyState(applicationStateSetupCode, 'Setup application...');