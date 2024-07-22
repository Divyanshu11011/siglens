/*
 * Copyright (c) 2021-2024 SigScalr, Inc.
 *
 * This file is part of SigLens Observability Solution
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

var queryIndex = 0;
let formulaCache = [];
var queries = {};
let formulas = {};

var lineCharts = {}; // Chart details
var chartDataCollection = {}; // Save label/data for each query
let mergedGraph;
let chartType = 'Line chart';
let availableMetrics = [];
let rawTimeSeriesData = [];
let allFunctions,
    functionsArray = [];
var aggregationOptions = ['max by', 'min by', 'avg by', 'sum by', 'count by', 'stddev by', 'stdvar by', 'group by'];
let timeUnit;
let dayCnt7 = 0;
let dayCnt2 = 0;
let selectedTheme = 'Classic';
let selectedLineStyle = 'Solid';
let selectedStroke = 'Normal';
// Used for alert screen
let isAlertScreen, isMetricsURL, isDashboardScreen;
//eslint-disable-next-line no-unused-vars
let metricsQueryParams;
var colorPalette = {
    Classic: ['#a3cafd', '#5795e4', '#d7c3fa', '#7462d8', '#f7d048', '#fbf09e'],
    Purple: ['#dbcdfa', '#c8b3fb', '#a082fa', '#8862eb', '#764cd8', '#5f36ac', '#27064c'],
    Cool: ['#cce9be', '#a5d9b6', '#89c4c2', '#6cabc9', '#5491c8', '#4078b1', '#2f5a9f', '#213e7d'],
    Green: ['#d0ebc2', '#c4eab7', '#aed69e', '#87c37d', '#5daa64', '#45884a', '#2e6a34', '#1a431f'],
    Warm: ['#f7e288', '#fadb84', '#f1b65d', '#ec954d', '#f65630', '#cf3926', '#aa2827', '#761727'],
    Orange: ['#f8ddbd', '#f4d2a9', '#f0b077', '#ec934f', '#e0722f', '#c85621', '#9b4116', '#72300e'],
    Gray: ['#c6ccd1', '#adb1b9', '#8d8c96', '#93969e', '#7d7c87', '#656571', '#62636a', '#4c4d57'],
    Palette: ['#5596c8', '#9c86cd', '#f9d038', '#66bfa1', '#c160c9', '#dd905a', '#4476c9', '#c5d741', '#9246b7', '#65d1d5', '#7975da', '#659d33', '#cf777e', '#f2ba46', '#59baee', '#cd92d8', '#508260', '#cf5081', '#a65c93', '#b0be4f']
};

// Function to check if CSV can be downloaded
function canDownloadCSV() {
    for (let key in chartDataCollection) {
        if (Object.prototype.hasOwnProperty.call(chartDataCollection, key) && chartDataCollection[key].datasets) {
            return true; // If any data is present, enable download
        }
    }
    return false; // No data found
}

// Function to check if JSON can be downloaded
function canDownloadJSON() {
    for (let key in chartDataCollection) {
        if (Object.prototype.hasOwnProperty.call(chartDataCollection, key) && chartDataCollection[key].datasets) {
            return true; // If any data is present, enable download
        }
    }
    return false; // No data found
}

// Update button states based on data availability
function updateDownloadButtons() {
    let csvButton = $('#csv-block');
    let jsonButton = $('#json-block');

    if (canDownloadCSV()) {
        csvButton.removeClass('disabled-tab');
    } else {
        csvButton.addClass('disabled-tab');
    }

    if (canDownloadJSON()) {
        jsonButton.removeClass('disabled-tab');
    } else {
        jsonButton.addClass('disabled-tab');
    }
}

$(document).ready(async function () {
    updateDownloadButtons();
    var currentPage = window.location.pathname;
    if (currentPage === '/alert.html' || currentPage === '/alert-details.html') {
        isAlertScreen = true;
    }
    filterStartDate = 'now-1h';
    filterEndDate = 'now';
    $('.inner-range #' + filterStartDate).addClass('active');
    datePickerHandler(filterStartDate, filterEndDate, filterStartDate);
    if (currentPage === '/dashboard.html') {
        isDashboardScreen = true;
    }

    $('#metrics-container #date-start').on('change', getStartDateHandler);
    $('#metrics-container #date-end').on('change', getEndDateHandler);
    $('#metrics-container #time-start').on('change', getStartTimeHandler);
    $('#metrics-container #time-end').on('change', getEndTimeHandler);
    $('#metrics-container #customrange-btn').on('click', customRangeHandlerMetrics);
    $('.range-item').on('click', metricsExplorerDatePickerHandler);

    $('.theme-btn').on('click', themePickerHandler);
    $('.theme-btn').on('click', updateChartColorsBasedOnTheme);
    allFunctions = await getFunctions();
    functionsArray = allFunctions.map(function (item) {
        return item.fn;
    });

    // Retrieve Query from Metrics Explorer URL to Display Query Element Formula and Visualization
    const urlParams = new URLSearchParams(window.location.search);
    if (currentPage.includes('metrics-explorer.html') && urlParams.has('queryString')) {
        let dataParam = getUrlParameter('queryString');
        let jsonString = decodeURIComponent(dataParam);
        let obj = JSON.parse(jsonString);
        isMetricsURL = true;
        populateMetricsQueryElement(obj);
    }

    if (!isAlertScreen && !isMetricsURL && !isDashboardScreen) {
        addQueryElement();
    }
});

async function customRangeHandlerMetrics(_evt) {
    $.each($('.range-item.active'), function () {
        $(this).removeClass('active');
    });
    $.each($('.db-range-item.active'), function () {
        $(this).removeClass('active');
    });
    datePickerHandler(filterStartDate, filterEndDate, 'custom');
    await refreshMetricsGraphs();
}

function getUrlParameter(name) {
    //eslint-disable-next-line no-useless-escape
    name = name.replace(/[\[]/, '\\[').replace(/[\]]/, '\\]');
    let regex = new RegExp('[\\?&]' + name + '=([^&#]*)');
    let results = regex.exec(location.search);
    return results === null ? '' : decodeURIComponent(results[1].replace(/\+/g, ' '));
}

async function metricsExplorerDatePickerHandler(evt) {
    evt.preventDefault();
    resetCustomDateRange();
    $.each($('.range-item.active'), function () {
        $(this).removeClass('active');
    });
    var selectedId = $(evt.currentTarget).attr('id');
    $(evt.currentTarget).addClass('active');
    datePickerHandler(selectedId, 'now', selectedId);

    await refreshMetricsGraphs();

    $('#daterangepicker').hide();
}

$('#add-query').on('click', addQueryElement);

$('#add-formula').on('click', function () {
    if (isAlertScreen) {
        addAlertsFormulaElement();
    } else {
        addMetricsFormulaElement();
    }
});
function addToFormulaCache(formulaId, formulaName) {
    formulaCache.push({ formulaId, formulaName });
}
$('.refresh-btn').on('click', refreshMetricsGraphs);

// Toggle switch between merged graph and single graphs
$('#toggle-switch').on('change', function () {
    if ($(this).is(':checked')) {
        $('#metrics-graphs').show();
        $('#merged-graph-container').hide();
    } else {
        $('#metrics-graphs').hide();
        $('#merged-graph-container').show();
    }
});

function generateUniqueId() {
    return 'formula_' + Math.random().toString(36).substr(2, 9);
}

function createFormulaElementTemplate(uniqueId, initialValue = '') {
    return $(`
        <div class="formula-box" data-id="${uniqueId}">
            <div style="position: relative;" class="d-flex">
                <div class="formula-arrow">↓</div>
                <input class="formula" placeholder="Formula, eg. 2*a" value="${initialValue}">
                <div class="formula-error-message" style="display: none;">
                    <div class="d-flex justify-content-center align-items-center"><i class="fas fa-exclamation"></i></div>
                </div>
            </div>
            <div>
                <div class="remove-query">×</div>
            </div>
        </div>`);
}

function formulaRemoveHandler(formulaElement, uniqueId) {
    formulaElement.find('.remove-query').on('click', function () {
        if (isAlertScreen) {
            var formulaBtn = $('#add-formula');
            formulas = {};
            formulaElement.remove();
            formulaBtn.prop('disabled', false);
            activateFirstQuery();
            $('.metrics-query .remove-query').removeClass('disabled').css('cursor', 'pointer').removeAttr('title');
        } else {
            delete formulas[uniqueId];
            formulaElement.remove();
            removeVisualizationContainer(uniqueId);
            $('.metrics-query .remove-query').removeClass('disabled').css('cursor', 'pointer').removeAttr('title');
        }
    });
}

function formulaInputHandler(formulaElement, uniqueId) {
    let input = formulaElement.find('.formula');
    input.on(
        'input',
        debounce(async function () {
            let formula = input.val().trim();
            let errorMessage = formulaElement.find('.formula-error-message');
            if (formula === '') {
                errorMessage.hide();
                input.removeClass('error-border');
                disableQueryRemoval();
                if (isAlertScreen) {
                    formulas = {};
                    activateFirstQuery();
                }
                // Run a different function when the formula is erased
                onFormulaErased(uniqueId);
                return;
            }
            let validationResult = validateFormula(formula);
            if (validationResult !== false) {
                errorMessage.hide();
                input.removeClass('error-border');
                formulas[uniqueId] = validationResult;
                if (isAlertScreen) {
                    $('#metrics-queries .metrics-query .query-name').removeClass('active');
                }
                if (Array.isArray(validationResult.queryNames) && validationResult.queryNames.length > 0) {
                    await getMetricsDataForFormula(uniqueId, validationResult);
                }
            } else {
                errorMessage.show();
                input.addClass('error-border');
            }
            disableQueryRemoval();
        }, 500)
    ); // debounce delay
}

async function addAlertsFormulaElement(formulaInput) {
    let uniqueId = generateUniqueId();
    let queryNames = Object.keys(queries);
    if (!formulaInput) {
        formulaInput = queryNames.join(' + ');
    }

    let formulaElement = $('#metrics-formula .formula-box').length > 0 ? $('.formula').val(formulaInput).removeClass('error-border').siblings('.formula-error-message').hide() : createFormulaElementTemplate(uniqueId, formulaInput);

    if ($('#metrics-formula .formula-box').length === 0) {
        $('#metrics-formula').append(formulaElement);
    }

    let validationResult = validateFormula(formulaInput);

    formulas[uniqueId] = validationResult;
    await getMetricsDataForFormula(uniqueId, validationResult);

    let formulaElements = $('.formula-arrow');
    let formulaBtn = $('#add-formula');
    if (formulaElements.length > 0) {
        formulaBtn.prop('disabled', true);
        $('#metrics-queries .metrics-query .query-name').removeClass('active');
    }

    formulaRemoveHandler(formulaElement, uniqueId);
    formulaInputHandler(formulaElement, uniqueId);
}

async function addMetricsFormulaElement(uniqueId = generateUniqueId(), formulaInput) {
    // For Dashboards
    if (formulaInput) {
        const validationResult = validateFormula(formulaInput);
        formulas[uniqueId] = validationResult;
        await getMetricsDataForFormula(uniqueId, validationResult);
    }

    const formulaElement = createFormulaElementTemplate(uniqueId, formulaInput);
    $('#metrics-formula').append(formulaElement);
    formulaRemoveHandler(formulaElement, uniqueId);
    formulaInputHandler(formulaElement, uniqueId);
}

function debounce(func, wait) {
    let timeout;
    return function (...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
}

// Function to call when the formula is erased
function onFormulaErased(uniqueId) {
    delete formulas[uniqueId];
    removeVisualizationContainer(uniqueId);
    updateCloseIconVisibility();
}

function validateFormula(formula) {
    // Regular expression to include numbers and query names
    let pattern = /^(\s*\w+\s*|\s*\d+\s*)(\s*[-+*/]\s*(\s*\w+\s*|\s*\d+\s*))*$/;
    let matches = formula.match(pattern);
    if (!matches) {
        return false;
    }
    let queryNames = Object.keys(queries);
    let parts = formula.split(/[-+*/]/);
    let usedQueryNames = [];
    for (let part of parts) {
        part = part.trim();
        // Check if the part is a query name or a number
        if (queryNames.includes(part)) {
            usedQueryNames.push(part);
        } else if (isNaN(part)) {
            return false; // Todo: if only numeric value is present in formula
        }
    }

    return {
        formula: formula,
        queryNames: usedQueryNames,
    };
}

function disableQueryRemoval() {
    // Loop through each query element
    $('.metrics-query').each(function () {
        var queryName = $(this).find('.query-name').text();
        var removeButton = $(this).find('.remove-query');
        var queryNameExistsInFormula = $('.formula')
            .toArray()
            .some(function (formulaInput) {
                return $(formulaInput).val().includes(queryName);
            });

        // If query name exists in any formula, disable the remove button
        if (queryNameExistsInFormula) {
            removeButton.addClass('disabled').css('cursor', 'not-allowed').attr('title', 'Query used in other formulas.');
        } else {
            removeButton.removeClass('disabled').css('cursor', 'pointer').removeAttr('title');
        }
    });
}

function createQueryElementTemplate(queryName) {
    return $(`
    <div class="metrics-query">
        <div class="query-box">
            <div class="query-name active">${queryName}</div>
            <div class="query-builder">
                <input type="text" class="metrics" placeholder="Select a metric" id="select-metric-input" >
                <div>from</div>
                <div class="tag-container">
                    <input type="text" class="everywhere" placeholder="(everywhere)">
                </div>
                <input class="agg-function" value="avg by">
                <div class="value-container">
                    <input class="everything" placeholder="(everything)">
                </div>
                <div class="functions-container">
                    <div class="all-selected-functions">
                    </div>
                    <div class="position-container">
                        <div class="show-functions">
                        </div>
                        <div class="options-container">
                            <input type="text" id="functions-search-box" class="search-box" placeholder="Search...">
                        </div>
                    </div>
                </div>
            </div>
            <div class="raw-query" style="display: none;">
                <input type="text" class="raw-query-input"><button class="btn run-filter-btn" id="run-filter-btn" title="Run your search"> </button>
            </div>
        </div>
        <div>
            <div class="raw-query-btn">&lt;/&gt;</div>
            <div class="alias-box">
                <div class="as-btn">as...</div>
                <div class="alias-filling-box" style="display: none;">
                    <div>as</div>
                    <input type="text" placeholder="alias">
                    <div>×</div>
                </div>
            </div>
            <div class="remove-query">×</div>
        </div>
    </div>`);
}

function setupQueryElementEventListeners(queryElement) {
    // Remove query element
    queryElement.find('.remove-query').on('click', function () {
        var queryName = queryElement.find('.query-name').text();
        // Check if the query name exists in any of the formula input fields
        var queryNameExistsInFormula = $('.formula')
            .toArray()
            .some(function (formulaInput) {
                return $(formulaInput).val().includes(queryName);
            });

        // If query name exists in any formula, prevent removal of the query element
        if (queryNameExistsInFormula) {
            $(this).addClass('disabled').css('cursor', 'not-allowed').attr('title', 'Query used in other formulas.');
        } else {
            delete queries[queryName];
            queryElement.remove();
            removeVisualizationContainer(queryName);

            // Show or hide the close icon based on the number of queries
            updateCloseIconVisibility();

            // For Alerts Screen
            if (isAlertScreen) {
                // Check if the formula element exists and if it is empty, or if the formula element does not exist
                if (!($('#metrics-formula .formula-box .formula').length && $('#metrics-formula .formula-box .formula').val().trim() !== '')) {
                    activateFirstQuery();
                }
            }
        }
    });

    // Alias button
    queryElement.find('.as-btn').on('click', function () {
        $(this).hide(); // Hide the "as..." button
        $(this).siblings('.alias-filling-box').show(); // Show alias input box
    });

    // Alias close button
    queryElement
        .find('.alias-filling-box div')
        .last()
        .on('click', function () {
            $(this).parent().hide();
            $(this).parent().siblings('.as-btn').show();
        });

    // Hide or Show query element and graph on click on query name
    queryElement.find('.query-name').on('click', function () {
        var queryNameElement = $(this);
        var queryName = queryNameElement.text();
        var numberOfGraphVisible = $('#metrics-graphs').children('.metrics-graph').filter(':visible').length;
        var metricsGraph = $('#metrics-graphs').find('.metrics-graph[data-query="' + queryName + '"]');

        if (numberOfGraphVisible > 1 || !metricsGraph.is(':visible')) {
            metricsGraph.toggle();
            queryNameElement.toggleClass('active');
        }
        numberOfGraphVisible = $('#metrics-graphs').children('.metrics-graph').filter(':visible').length;
        if (numberOfGraphVisible === 1) {
            $('.metrics-graph').addClass('full-width');
        } else {
            $('.metrics-graph').removeClass('full-width');
        }
    });

    // Show functions dropdown
    queryElement.find('.show-functions').on('click', function () {
        event.stopPropagation();
        var inputField = queryElement.find('#functions-search-box');
        var optionsContainer = queryElement.find('.options-container');
        var isContainerVisible = optionsContainer.is(':visible');

        if (!isContainerVisible) {
            optionsContainer.show();
            inputField.val('');
            inputField.focus();
            inputField.autocomplete('search', '');
        } else {
            optionsContainer.hide();
        }
    });

    // Hide the functions dropdown
    $('body').on('click', function (event) {
        var optionsContainer = queryElement.find('.options-container');
        var showFunctionsButton = queryElement.find('.show-functions');

        // Check if the clicked element is not part of the options container or the show-functions button
        if (!$(event.target).closest(optionsContainer).length && !$(event.target).is(showFunctionsButton)) {
            optionsContainer.hide(); // Hide the options container if clicked outside of it
        }
    });

    // Display Raw Query
    queryElement.find('.raw-query-btn').on('click', function () {
        queryElement.find('.query-builder').toggle();
        queryElement.find('.raw-query').toggle();
        var queryName = queryElement.find('.query-name').text();
        var queryDetails = queries[queryName];

        if (queryDetails.state === 'builder') {
            // Switch to raw mode
            queryDetails.state = 'raw';
            const queryString = createQueryString(queryDetails);
            if (!queryDetails.rawQueryExecuted) {
                queryDetails.rawQueryInput = queryString;
                queryElement.find('.raw-query-input').val(queryString);
            }
        } else {
            // Switch to builder mode
            queryDetails.state = 'builder';
            getQueryDetails(queryName, queryDetails);
        }
    });

    // Run the raw query
    queryElement.find('.raw-query').on('click', '#run-filter-btn', async function () {
        var queryName = queryElement.find('.query-name').text();
        var queryDetails = queries[queryName];
        var rawQuery = queryElement.find('.raw-query-input').val();
        queryDetails.rawQueryInput = rawQuery;
        queryDetails.rawQueryExecuted = true; // Set the flag to indicate that raw query has been executed
        // Perform the search with the raw query
        await getQueryDetails(queryName, queryDetails);
    });
}

async function addQueryElement() {
    // Clone the first query element if it exists, otherwise create a new one
    var queryElement;
    if (queryIndex === 0) {
        queryElement = createQueryElementTemplate(String.fromCharCode(97 + queryIndex));
        $('#metrics-queries').append(queryElement);
        const metricNames = await getMetricNames();
        metricNames.metricNames.sort();
        queryElement.find('.metrics').val(metricNames.metricNames[0]); // Initialize first query element with first metric name

        // Initialize autocomplete with the details of the previous query if it exists
        await initializeAutocomplete(queryElement, undefined);
    } else {
        // Get the last query name
        var lastQueryName = $('#metrics-queries').find('.metrics-query:last .query-name').text();
        // Determine the next query name based on the last query name
        var nextQueryName = String.fromCharCode(lastQueryName.charCodeAt(0) + 1);

        queryElement = $('#metrics-queries').find('.metrics-query').last().clone();
        queryElement.find('.query-name').text(nextQueryName);
        queryElement.find('.remove-query').removeClass('disabled').css('cursor', 'pointer').removeAttr('title');
        queryElement.find('.query-builder').show();
        queryElement.find('.raw-query').hide();
        $('#metrics-queries').append(queryElement);
        // Initialize autocomplete with the details of the previous query if it exists
        await initializeAutocomplete(queryElement, queries[lastQueryName]);

        if (isAlertScreen) {
            await addAlertsFormulaElement();
        }
    }
    // Show or hide the query close icon based on the number of queries
    updateCloseIconVisibility();
    setupQueryElementEventListeners(queryElement);
    queryIndex++;


}

async function initializeAutocomplete(queryElement, previousQuery = {}) {
    let queryName = queryElement.find('.query-name').text();
    let availableEverywhere = [];
    let availableEverything = [];
    var queryDetails = {
        metrics: '',
        everywhere: [],
        everything: [],
        aggFunction: 'avg by',
        functions: [],
        state: 'builder',
        rawQueryInput: '',
        rawQueryExecuted: false,
    };
    // Use details from the previous query if it exists
    if (!jQuery.isEmptyObject(previousQuery)) {
        queryDetails.metrics = previousQuery.metrics;
        queryDetails.everywhere = previousQuery.everywhere.slice();
        queryDetails.everything = previousQuery.everything.slice();
        queryDetails.aggFunction = previousQuery.aggFunction;
        queryDetails.functions = previousQuery.functions.slice();
    }

    var currentMetricsValue = queryElement.find('.metrics').val();

    if (currentMetricsValue) {
        queryDetails.metrics = currentMetricsValue;

        const tagsAndValue = await getTagKeyValue(currentMetricsValue);
        availableEverywhere = tagsAndValue.availableEverywhere;

        availableEverything = tagsAndValue.availableEverything[0];
        // Remove items from availableEverything if they are present in queryDetails.everything
        queryDetails.everything.forEach((item) => {
            const index = availableEverything.indexOf(item);
            if (index !== -1) {
                availableEverything.splice(index, 1);
            }
        });
        getQueryDetails(queryName, queryDetails);
    }

    queryElement
        .find('.metrics')
        .autocomplete({
            source: availableMetrics.sort(),
            minLength: 0,
            focus: function (event, ui) {
                $(this).val(ui.item.value);
                return false;
            },
            select: async function (event, ui) {
                queryDetails.metrics = ui.item.value;
                getQueryDetails(queryName, queryDetails);
                const tagsAndValue = await getTagKeyValue(ui.item.value);
                availableEverything = tagsAndValue.availableEverything[0];
                availableEverywhere = tagsAndValue.availableEverywhere;
                queryElement.find('.everywhere').autocomplete('option', 'source', availableEverywhere);
                queryElement.find('.everything').autocomplete('option', 'source', availableEverything);
                $(this).blur();
            },
            classes: {
                'ui-autocomplete': 'metrics-ui-widget',
            },
        })
        .on('click', function () {
            if ($(this).autocomplete('widget').is(':visible')) {
                $(this).autocomplete('close');
            } else {
                $(this).autocomplete('search', '');
            }
        })
        .on('click', function () {
            $(this).select();
        })
        .on('close', function (_event) {
            var selectedValue = $(this).val();
            if (selectedValue === '') {
                $(this).val(queryDetails.metrics);
            }
        })
        .on('keydown', function (event) {
            if (event.keyCode === 27) {
                // For the Escape key
                var selectedValue = $(this).val();
                if (selectedValue === '') {
                    $(this).val(queryDetails.metrics);
                } else if (!availableMetrics.includes(selectedValue)) {
                    $(this).val(queryDetails.metrics);
                } else {
                    queryDetails.metrics = selectedValue;
                }
                $(this).blur();
            }
        })
        .on('change', function () {
            var selectedValue = $(this).val();
            if (!availableMetrics.includes(selectedValue)) {
                $(this).val(queryDetails.metrics);
            } else {
                queryDetails.metrics = selectedValue;
            }
            $(this).blur();
        });

    // Everywhere input (tag:value)
    queryElement
        .find('.everywhere')
        .autocomplete({
            source: function (request, response) {
                var filtered = $.grep(availableEverywhere, function (item) {
                    // Check if the tag part of item is not present in queryDetails.everywhere
                    var tag = item.split(':')[0];
                    return (
                        item.toLowerCase().indexOf(request.term.toLowerCase()) !== -1 &&
                        !queryDetails.everywhere.some(function (existingTag) {
                            return existingTag.startsWith(tag + ':');
                        })
                    );
                });
                filtered.sort();
                response(filtered);
            },
            minLength: 0,
            select: function (event, ui) {
                addTag(queryElement, ui.item.value);
                queryDetails.everywhere.push(ui.item.value);
                getQueryDetails(queryName, queryDetails);
                var index = availableEverywhere.indexOf(ui.item.value);
                if (index !== -1) {
                    availableEverywhere.splice(index, 1);
                }
                $(this).val('');
                updateAutocompleteSource();
                return false;
            },
            classes: {
                'ui-autocomplete': 'metrics-ui-widget',
            },
            open: function (_event, _ui) {
                var containerPosition = $(this).closest('.tag-container').offset();

                $(this)
                    .autocomplete('widget')
                    .css({
                        position: 'absolute',
                        top: containerPosition.top + $(this).closest('.tag-container').outerHeight(),
                        left: containerPosition.left,
                        'z-index': 1000,
                    });
            },
        })
        .on('click', function () {
            if ($(this).autocomplete('widget').is(':visible')) {
                $(this).autocomplete('close');
            } else {
                $(this).autocomplete('search', '');
            }
        })
        .on('input', function () {
            this.style.width = this.value.length * 8 + 'px';
            let typedValue = $(this).val();

            // Remove the wildcard option from available options when the input value changes
            if (!typedValue.includes(':')) {
                availableEverywhere = availableEverywhere.filter(function (option) {
                    return !option.includes(':*');
                });
            }

            // Add the wildcard option if the typed value contains a colon ":"
            if (typedValue.includes(':')) {
                var parts = typedValue.split(':');
                var prefix = parts[0];
                var suffix = parts[1];
                var wildcardOption = prefix + ':' + suffix + '*';

                availableEverywhere = availableEverywhere.filter(function (option) {
                    return !option.includes('*');
                });
                // Check if the typed value already exists in the available options
                if (!availableEverywhere.includes(typedValue)) {
                    availableEverywhere.unshift(wildcardOption);
                }
            }
            updateAutocompleteSource();
        });

    queryElement.on('click', '.tag .close', function () {
        var tagContainer = queryElement.find('.everywhere');

        var tagValue = $(this)
            .parent()
            .contents()
            .filter(function () {
                return this.nodeType === 3;
            })
            .text()
            .trim();
        var index = queryDetails.everywhere.indexOf(tagValue);
        if (index !== -1) {
            queryDetails.everywhere.splice(index, 1);
            getQueryDetails(queryName, queryDetails);
        }
        availableEverywhere.push(tagValue);
        availableEverywhere.sort();
        queryElement.find('.everywhere').autocomplete('option', 'source', availableEverywhere);

        $(this).parent().remove();

        if (queryElement.find('.tag-container').find('.tag').length === 0) {
            tagContainer.attr('placeholder', '(everywhere)');
            tagContainer.css('width', '100%');
        }
        updateAutocompleteSource();
    });

    // Aggregation input
    queryElement
        .find('.agg-function')
        .autocomplete({
            source: aggregationOptions.sort(),
            minLength: 0,
            select: function (event, ui) {
                queryDetails.aggFunction = ui.item.value;
                getQueryDetails(queryName, queryDetails);
                $(this).blur();
            },
            classes: {
                'ui-autocomplete': 'metrics-ui-widget',
            },
        })
        .on('click', function () {
            if ($(this).autocomplete('widget').is(':visible')) {
                $(this).autocomplete('close');
            } else {
                $(this).autocomplete('search', '');
            }
        })
        .on('click', function () {
            $(this).select();
        });

    // Everything input (value)
    queryElement
        .find('.everything')
        .autocomplete({
            source: function (request, response) {
                var filtered = $.grep(availableEverything, function (item) {
                    return item.toLowerCase().indexOf(request.term.toLowerCase()) !== -1;
                });
                var sorted = filtered.sort();
                response(sorted);
            },
            minLength: 0,
            select: function (event, ui) {
                addValue(queryElement, ui.item.value);
                queryDetails.everything.push(ui.item.value);
                getQueryDetails(queryName, queryDetails);
                var index = availableEverything.indexOf(ui.item.value);
                if (index !== -1) {
                    availableEverything.splice(index, 1);
                }
                $(this).val('');
                return false;
            },
            classes: {
                'ui-autocomplete': 'metrics-ui-widget',
            },
            open: function (_event, _ui) {
                var containerPosition = $(this).closest('.value-container').offset();

                $(this)
                    .autocomplete('widget')
                    .css({
                        position: 'absolute',
                        top: containerPosition.top + $(this).closest('.value-container').outerHeight(),
                        left: containerPosition.left,
                        'z-index': 1000,
                    });
            },
        })
        .on('click', function () {
            if ($(this).autocomplete('widget').is(':visible')) {
                $(this).autocomplete('close');
            } else {
                $(this).autocomplete('search', '');
            }
        })
        .on('input', function () {
            this.style.width = this.value.length * 8 + 'px';
        });

    queryElement.on('click', '.value .close', function () {
        var valueContainer = queryElement.find('.everything');

        var value = $(this)
            .parent()
            .contents()
            .filter(function () {
                return this.nodeType === 3;
            })
            .text()
            .trim();
        var index = queryDetails.everything.indexOf(value);
        if (index !== -1) {
            queryDetails.everything.splice(index, 1);
            getQueryDetails(queryName, queryDetails);
        }
        availableEverything.push(value);
        availableEverything.sort();
        queryElement.find('.everything').autocomplete('option', 'source', availableEverything);

        $(this).parent().remove();

        if (queryElement.find('.value-container').find('.value').length === 0) {
            valueContainer.attr('placeholder', '(everything)');
            valueContainer.css('width', '100%');
        }
    });

    queryElement
        .find('#functions-search-box')
        .autocomplete({
            source: allFunctions.map(function (item) {
                return item.name;
            }),
            minLength: 0,
            select: function (event, ui) {
                var selectedItem = allFunctions.find(function (item) {
                    return item.name === ui.item.value;
                });
                // Check if the selected function is already in queryDetails.functions
                var indexToRemove = queryDetails.functions.indexOf(selectedItem.fn);
                if (indexToRemove !== -1) {
                    queryDetails.functions.splice(indexToRemove, 1); // Remove it
                    $(this)
                        .closest('.metrics-query')
                        .find('.selected-function:contains(' + selectedItem.fn + ')')
                        .remove();
                }

                queryDetails.functions.push(selectedItem.fn);
                appendFunctionDiv(queryElement, selectedItem.fn);
                getQueryDetails(queryName, queryDetails);

                queryElement.find('.options-container').hide();
                $(this).val('');
            },
            classes: {
                'ui-autocomplete': 'metrics-ui-widget',
            },
        })
        .on('click', function () {
            if ($(this).autocomplete('widget').is(':visible')) {
                $(this).autocomplete('close');
            } else {
                $(this).autocomplete('search', '');
            }
        })
        .on('click', function () {
            $(this).select();
        });

    $('.all-selected-functions').on('click', '.selected-function .close', function () {
        var fnToRemove = $(this)
            .parent('.selected-function')
            .contents()
            .filter(function () {
                return this.nodeType === 3;
            })
            .text()
            .trim();
        var indexToRemove = queryDetails.functions.indexOf(fnToRemove);
        if (indexToRemove !== -1) {
            queryDetails.functions.splice(indexToRemove, 1);
            getQueryDetails(queryName, queryDetails);
        }
        $(this).parent('.selected-function').remove();
    });

    // Wildcard option
    function updateAutocompleteSource() {
        var selectedTags = queryDetails.everywhere.map(function (tag) {
            return tag.split(':')[0];
        });
        var filteredOptions = availableEverywhere.filter(function (option) {
            var optionTag = option.split(':')[0];
            return !selectedTags.includes(optionTag);
        });
        filteredOptions.sort();
        queryElement.find('.everywhere').autocomplete('option', 'source', filteredOptions);
    }

    queries[queryElement.find('.query-name').text()] = queryDetails;
    previousQuery = queryDetails;
}

function updateCloseIconVisibility() {
    var numQueries = $('#metrics-queries').children('.metrics-query').length;
    $('.metrics-query .remove-query').toggle(numQueries > 1);
}
function prepareChartData(seriesData, chartDataCollection, queryName) {
    var labels = [];
    var datasets = [];

    if (seriesData.length > 0) {
        seriesData.forEach(function (series, _index) {
            Object.keys(series.values).forEach((tsvalue) => {
                labels.push(new Date(tsvalue));
            });
        });

        labels.sort((a, b) => a - b);

        datasets = seriesData.map(function (series, index) {
            return {
                label: series.seriesName,
                data: series.values,
                borderColor: colorPalette.Classic[index % colorPalette.Classic.length],
                backgroundColor: colorPalette.Classic[index % colorPalette.Classic.length] + '70',
                borderWidth: 2,
                fill: false,
            };
        });
    }

    var chartData = {
        labels: labels,
        datasets: datasets,
    };

    // Save chart data to the global variable
    chartDataCollection[queryName] = chartData;

    return chartData;
}

function initializeChart(canvas, seriesData, queryName, chartType) {
    var ctx = canvas[0].getContext('2d');
    let chartData = prepareChartData(seriesData, chartDataCollection, queryName);
    const { gridLineColor, tickColor } = getGraphGridColors();
    var selectedPalette = colorPalette[selectedTheme] || colorPalette.Classic;
    var lineChart = new Chart(ctx, {
        type: chartType === 'Area chart' ? 'line' : chartType === 'Bar chart' ? 'bar' : 'line',
        data: chartData,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    align: 'start',
                    labels: {
                        boxWidth: 10,
                        boxHeight: 2,
                        fontSize: 10,
                    },
                },
            },
            scales: {
                x: {
                    type: 'time',
                    display: true,
                    title: {
                        display: true,
                        text: '',
                    },
                    grid: {
                        display: false,
                    },
                    ticks: {
                        color: tickColor,
                        callback: xaxisFomatter,
                        autoSkip: false,
                        major: {
                            enabled: true,
                        },
                        font: (context) => {
                            if (context.tick && context.tick.major) {
                                return {
                                    weight: 'bold',
                                };
                            }
                            return {
                                weight: 'normal',
                            };
                        },
                    },
                    time: {
                        unit: timeUnit.includes('day') ? 'day' : timeUnit.includes('hour') ? 'hour' : timeUnit.includes('minute') ? 'minute' : timeUnit,
                        tooltipFormat: 'MMM d, HH:mm:ss',
                        displayFormats: {
                            minute: 'HH:mm',
                            hour: 'HH:mm',
                            day: 'MMM d',
                            month: 'MMM YYYY',
                        },
                    },
                },
                y: {
                    display: true,
                    title: {
                        display: false,
                    },
                    grid: { color: gridLineColor },
                    ticks: { color: tickColor },
                },
            },
            spanGaps: true,
        },
    });

    // Apply selected theme colors
    chartData.datasets.forEach(function (dataset, index) {
        dataset.borderColor = selectedPalette[index % selectedPalette.length];
        dataset.backgroundColor = selectedPalette[index % selectedPalette.length] + '70'; // opacity
        dataset.borderDash = selectedLineStyle === 'Dash' ? [5, 5] : selectedLineStyle === 'Dotted' ? [1, 3] : [];
        dataset.borderWidth = selectedStroke === 'Thin' ? 1 : selectedStroke === 'Thick' ? 3 : 2;
    });

    // Modify the fill property based on the chart type after chart initialization
    if (chartType === 'Area chart') {
        lineChart.config.data.datasets.forEach(function (dataset) {
            dataset.fill = true;
        });
    } else {
        lineChart.config.data.datasets.forEach(function (dataset) {
            dataset.fill = false;
        });
    }

    lineChart.update();
    return lineChart;
}

function addVisualizationContainer(queryName, seriesData, queryString, panelId) {
    var canvas;
    if (isDashboardScreen) {
        // For dashboard page
        prepareChartData(seriesData, chartDataCollection, queryName);
        mergeGraphs(chartType, panelId);
    } else {
        // For metrics explorer page
        var existingContainer = $(`.metrics-graph[data-query="${queryName}"]`);
        if (existingContainer.length === 0) {
            var visualizationContainer = $(`
            <div class="metrics-graph" data-query="${queryName}">
                <div class="query-string">${queryString}</div>
                <div class="graph-canvas"></div>
            </div>`);

            // Determine where to insert the new container
            if (queryName.startsWith('formula')) {
                // Insert after all formula queries
                var lastFormula = $('#metrics-graphs .metrics-graph[data-query^="formula"]:last');
                if (lastFormula.length) {
                    lastFormula.after(visualizationContainer);
                } else {
                    // If no formula queries exist, append to the end
                    $('#metrics-graphs').append(visualizationContainer);
                }
            } else {
                // Insert before the first formula query
                var firstFormula = $('#metrics-graphs .metrics-graph[data-query^="formula"]:first');
                if (firstFormula.length) {
                    firstFormula.before(visualizationContainer);
                } else {
                    // If no formula queries exist, append to the end
                    $('#metrics-graphs').append(visualizationContainer);
                }
            }

            canvas = $('<canvas></canvas>');
            visualizationContainer.find('.graph-canvas').append(canvas);
        } else {
            existingContainer.find('.query-string').text(queryString);
            canvas = $('<canvas></canvas>');
            existingContainer.find('.graph-canvas').empty().append(canvas);
        }

        var lineChart = initializeChart(canvas, seriesData, queryName, chartType);

        lineCharts[queryName] = lineChart;
        updateGraphWidth();
        mergeGraphs(chartType);
    }
    addToFormulaCache(queryName, queryString);
    // Apply stored settings to the new query element
    updateChartTheme(selectedTheme);
    updateLineCharts(selectedLineStyle, selectedStroke);
}

function removeVisualizationContainer(queryName) {
    var containerToRemove = $('#metrics-graphs').find('.metrics-graph[data-query="' + queryName + '"]');
    containerToRemove.remove();
    delete chartDataCollection[queryName];
    delete lineCharts[queryName];
    updateGraphWidth();
    mergeGraphs(chartType);
}

function updateGraphWidth() {
    var numQueries = $('#metrics-graphs .metrics-graph').length; // Count the number of .metrics-graph elements
    if (numQueries === 1) {
        $('#metrics-graphs .metrics-graph').addClass('full-width');
    } else {
        $('#metrics-graphs .metrics-graph').removeClass('full-width');
    }
}

// Function to show/hide Line Style and Stroke based on Display input
function toggleLineOptions(displayValue) {
    if (displayValue === 'Line chart') {
        $('#line-style-div').show();
        $('#stroke-div').show();
    } else {
        $('#line-style-div').hide();
        $('#stroke-div').hide();
    }
}

var displayOptions = ['Line chart', 'Bar chart', 'Area chart'];
$('#display-input')
    .autocomplete({
        source: displayOptions,
        minLength: 0,
        select: function (event, ui) {
            toggleLineOptions(ui.item.value);
            chartType = ui.item.value;
            toggleChartType(ui.item.value);
            $(this).blur();
        },
    })
    .on('click', function () {
        if ($(this).autocomplete('widget').is(':visible')) {
            $(this).autocomplete('close');
        } else {
            $(this).autocomplete('search', '');
        }
    })
    .on('click', function () {
        $(this).select();
    });

function toggleChartType(chartType) {
    // Convert the selected chart type to the corresponding Chart.js chart type
    var chartJsType;
    switch (chartType) {
        case 'Line chart':
            chartJsType = 'line';
            break;
        case 'Bar chart':
            chartJsType = 'bar';
            break;
        case 'Area chart':
            chartJsType = 'line'; // Area chart is essentially a line chart with fill
            break;
        default:
            chartJsType = 'line'; // Default to line chart
    }

    // Loop through each chart data
    for (var queryName in chartDataCollection) {
        if (Object.prototype.hasOwnProperty.call(chartDataCollection, queryName)) {
            var lineChart = lineCharts[queryName];

            lineChart.config.type = chartJsType;

            if (chartType === 'Area chart') {
                lineChart.config.data.datasets.forEach(function (dataset) {
                    dataset.fill = true;
                });
            } else {
                lineChart.config.data.datasets.forEach(function (dataset) {
                    dataset.fill = false;
                });
            }

            lineChart.update();
        }
    }

    mergeGraphs(chartType);
}

var colorOptions = ['Classic', 'Purple', 'Cool', 'Green', 'Warm', 'Orange', 'Gray', 'Palette'];
$('#color-input')
    .autocomplete({
        source: colorOptions,
        minLength: 0,
        select: function (event, ui) {
            let selectedColorTheme = ui.item.value;
            updateChartTheme(selectedColorTheme);
            $(this).blur();
        },
    })
    .on('click', function () {
        if ($(this).autocomplete('widget').is(':visible')) {
            $(this).autocomplete('close');
        } else {
            $(this).autocomplete('search', '');
        }
    })
    .on('click', function () {
        $(this).select();
    });

    function updateChartTheme(theme) {
        selectedTheme = theme; // Store the selected theme
        var selectedPalette = colorPalette[selectedTheme] || colorPalette.Classic;

        // Loop through each chart data
        for (var queryName in chartDataCollection) {
            if (Object.prototype.hasOwnProperty.call(chartDataCollection, queryName)) {
                var chartData = chartDataCollection[queryName];
                chartData.datasets.forEach(function (dataset, index) {
                    dataset.borderColor = selectedPalette[index % selectedPalette.length];
                    dataset.backgroundColor = selectedPalette[index % selectedPalette.length] + 70; // opacity
                });
    
                var lineChart = lineCharts[queryName];
                if (lineChart) {
                    lineChart.update();
                }
            }
        }
    
        if (mergedGraph && mergedGraph.data && mergedGraph.data.datasets) {
            mergedGraph.data.datasets.forEach(function (dataset, index) {
                dataset.borderColor = selectedPalette[index % selectedPalette.length];
                dataset.backgroundColor = selectedPalette[index % selectedPalette.length] + 70;
            });
            mergedGraph.update();
        }
    }

var lineStyleOptions = ['Solid', 'Dash', 'Dotted'];
var strokeOptions = ['Normal', 'Thin', 'Thick'];

$('#line-style-input')
    .autocomplete({
        source: lineStyleOptions,
        minLength: 0,
        select: function (event, ui) {
            var selectedLineStyle = ui.item.value;
            var selectedStroke = $('#stroke-input').val();
            updateLineCharts(selectedLineStyle, selectedStroke);
            $(this).blur();
        },
    })
    .on('click', function () {
        if ($(this).autocomplete('widget').is(':visible')) {
            $(this).autocomplete('close');
        } else {
            $(this).autocomplete('search', '');
        }
    })
    .on('click', function () {
        $(this).select();
    });

$('#stroke-input')
    .autocomplete({
        source: strokeOptions,
        minLength: 0,
        select: function (event, ui) {
            var selectedStroke = ui.item.value;
            var selectedLineStyle = $('#line-style-input').val();
            updateLineCharts(selectedLineStyle, selectedStroke);
            $(this).blur();
        },
    })
    .on('click', function () {
        if ($(this).autocomplete('widget').is(':visible')) {
            $(this).autocomplete('close');
        } else {
            $(this).autocomplete('search', '');
        }
    })
    .on('click', function () {
        $(this).select();
    });

// Function to update all line charts based on selected line style and stroke
function updateLineCharts(lineStyle, stroke) {
    selectedLineStyle = lineStyle;
    selectedStroke = stroke;
    // Loop through each chart data
    for (var queryName in chartDataCollection) {
        if (Object.prototype.hasOwnProperty.call(chartDataCollection, queryName)) {
            var chartData = chartDataCollection[queryName];
            // Loop through each dataset in the chart data
            chartData.datasets.forEach(function (dataset) {
                // Update dataset properties
                dataset.borderDash = lineStyle === 'Dash' ? [5, 5] : lineStyle === 'Dotted' ? [1, 3] : [];
                dataset.borderWidth = stroke === 'Thin' ? 1 : stroke === 'Thick' ? 3 : 2;
            });

            var lineChart = lineCharts[queryName];
            if (lineChart) {
                lineChart.update();
            }
        }
    }

    if (mergedGraph && mergedGraph.data && mergedGraph.data.datasets) {
        mergedGraph.data.datasets.forEach(function (dataset) {
            dataset.borderDash = lineStyle === 'Dash' ? [5, 5] : lineStyle === 'Dotted' ? [1, 3] : [];
            dataset.borderWidth = stroke === 'Thin' ? 1 : stroke === 'Thick' ? 3 : 2;
        });

        mergedGraph.update();
    }
}
function convertToCSV(obj) {
    let csv = 'Queries, Timestamp, Value\n';
    for (let key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key) && obj[key].datasets) {
            let formulaId = key.startsWith('formula_') ? key : '';

            // Find formula name in formulaCache
            let formulaDetails = formulaCache.find((item) => item.formulaId === formulaId);

            obj[key].datasets.forEach((dataset) => {
                for (let timestamp in dataset.data) {
                    if (dataset.data[timestamp] !== null) {
                        // Use formulaDetails.formulaName as the formula name
                        let formulaName = formulaDetails ? formulaDetails.formulaName : formulaId;
                        let queryLabel = dataset.label.replace(',', ''); // Remove comma if present
                        if (formulaName == '') {
                            csv += `${queryLabel}, ${timestamp}, ${dataset.data[timestamp]}\n`;
                        } else {
                            csv += `${formulaName}, ${timestamp}, ${dataset.data[timestamp]}\n`;
                        }
                    }
                }
            });
        }
    }
    return csv;
}

// Function to download CSV file
function downloadCSV() {
    let csvContent = convertToCSV(chartDataCollection);
    let blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    let url = URL.createObjectURL(blob);
    let link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'data.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// Function to download JSON file
function downloadJSON() {
    let formattedData = {};

    for (let key in chartDataCollection) {
        if (Object.prototype.hasOwnProperty.call(chartDataCollection, key) && chartDataCollection[key].datasets) {
            let formulaId = key.startsWith('formula_') ? key : '';
            let formulaDetails = formulaCache.find((item) => item.formulaId === formulaId);

            formattedData[key] = {
                formulaName: formulaDetails ? formulaDetails.formulaName : formulaId,
                datasets: [],
            };

            chartDataCollection[key].datasets.forEach((dataset) => {
                let formattedDataset = {
                    label: dataset.label,
                    data: {},
                };

                for (let timestamp in dataset.data) {
                    if (dataset.data[timestamp] !== null) {
                        formattedDataset.data[timestamp] = dataset.data[timestamp];
                    }
                }

                formattedData[key].datasets.push(formattedDataset);
            });
        }
    }

    let jsonContent = JSON.stringify(formattedData, null, 2);
    let blob = new Blob([jsonContent], { type: 'application/json' });
    let url = URL.createObjectURL(blob);
    let link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'data.json');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

$('#csv-block').on('click', function () {
    if (canDownloadCSV()) {
        downloadCSV();
    }
});

$('#json-block').on('click', function () {
    if (canDownloadJSON()) {
        downloadJSON();
    }
});

// Merge Graphs in one
function mergeGraphs(chartType, panelId = -1) {
    var mergedCtx;
    if (isDashboardScreen) {
        // For dashboard page
        var panelChartEl;
        if (panelId === -1) {
            panelChartEl = $(`.panelDisplay .panEdit-panel`);
        } else {
            panelChartEl = $(`#panel${panelId} .panEdit-panel`);
            panelChartEl.css('width', '100%').css('height', '100%');
        }

        panelChartEl.empty(); // Clear any existing content
        var mergedCanvas = $('<canvas></canvas>');
        panelChartEl.append(mergedCanvas);

        mergedCtx = panelChartEl.find('canvas')[0].getContext('2d');
    } else {
        // For metrics explorer page
        var visualizationContainer = $(`
            <div class="merged-graph-name"></div>
            <div class="merged-graph"></div>`);

        $('#merged-graph-container').empty().append(visualizationContainer);

        mergedCanvas = $('<canvas></canvas>');

        $('.merged-graph').empty().append(mergedCanvas);
        mergedCtx = mergedCanvas[0].getContext('2d');
    }

    var mergedData = {
        labels: [],
        datasets: [],
    };
    var graphNames = [];

    // Loop through chartDataCollection to merge datasets
    for (var queryName in chartDataCollection) {
        if (Object.prototype.hasOwnProperty.call(chartDataCollection, queryName)) {
            // Merge datasets for the current query
            var datasets = chartDataCollection[queryName].datasets;
            graphNames.push(`Metrics query - ${queryName}`);
            datasets.forEach(function (dataset) {
                mergedData.datasets.push({
                    label: dataset.label,
                    data: dataset.data,
                    borderColor: dataset.borderColor,
                    borderWidth: dataset.borderWidth,
                    backgroundColor: dataset.backgroundColor,
                    fill: chartType === 'Area chart' ? true : false,
                    borderDash: selectedLineStyle === 'Dash' ? [5, 5] : selectedLineStyle === 'Dotted' ? [1, 3] : [],
                });
            });
            // Update labels ( same for all graphs)
            mergedData.labels = chartDataCollection[queryName].labels;
        }
    }
    $('.merged-graph-name').html(graphNames.join(', '));
    const { gridLineColor, tickColor } = getGraphGridColors();
    var mergedLineChart = new Chart(mergedCtx, {
        type: chartType === 'Area chart' ? 'line' : chartType === 'Bar chart' ? 'bar' : 'line',
        data: mergedData,
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: shouldShowLegend(panelId, mergedData.datasets),
                    position: 'bottom',
                    align: 'start',
                    labels: {
                        boxWidth: 10,
                        boxHeight: 2,
                        fontSize: 10,
                    },
                },
            },
            scales: {
                x: {
                    type: 'time',
                    display: true,
                    title: {
                        display: true,
                        text: '',
                    },
                    grid: {
                        display: false,
                    },
                    ticks: {
                        color: tickColor,
                        callback: xaxisFomatter,
                        autoSkip: false,
                        major: {
                            enabled: true,
                        },
                        font: (context) => {
                            if (context.tick && context.tick.major) {
                                return {
                                    weight: 'bold',
                                };
                            }
                            return {
                                weight: 'normal',
                            };
                        },
                    },
                    time: {
                        unit: timeUnit.includes('day') ? 'day' : timeUnit.includes('hour') ? 'hour' : timeUnit.includes('minute') ? 'minute' : timeUnit,
                        tooltipFormat: 'MMM d, HH:mm:ss',
                        displayFormats: {
                            minute: 'HH:mm',
                            hour: 'HH:mm',
                            day: 'MMM d',
                            month: 'MMM YYYY',
                        },
                    },
                },
                y: {
                    display: true,
                    title: {
                        display: false,
                    },
                    grid: { color: gridLineColor },
                    ticks: { color: tickColor },
                },
            },
            spanGaps: true,
        },
    });
    mergedGraph = mergedLineChart;
    updateDownloadButtons();
}


const shouldShowLegend = (panelId, datasets) => {
    return panelId === -1 || datasets.length < 5;
};

// Converting the response in form to use to create graphs
async function convertDataForChart(data) {
    let seriesArray = [];

    if (Object.prototype.hasOwnProperty.call(data, 'series') && Object.prototype.hasOwnProperty.call(data, 'timestamps') && Object.prototype.hasOwnProperty.call(data, 'values')) {
        let chartStartTime = data.startTime;
        let chartEndTime = Math.floor(Date.now() / 1000);
        const timeRange = chartEndTime - chartStartTime;
        // // Determine the best time unit based on the time range
        if (timeRange > 365 * 24 * 60 * 60) {
            timeUnit = 'month';
        } else if (timeRange >= 90 * 24 * 60 * 60) {
            timeUnit = '7day';
        } else if (timeRange >= 30 * 24 * 60 * 60) {
            timeUnit = '2day';
        } else if (timeRange >= 7 * 24 * 60 * 60) {
            timeUnit = '12hour';
        } else if (timeRange >= 2 * 24 * 60 * 60) {
            timeUnit = '6hour';
        } else if (timeRange >= 24 * 60 * 60) {
            timeUnit = '3hour';
        } else if (timeRange >= 12 * 60 * 60) {
            timeUnit = '30minute';
        } else if (timeRange >= 3 * 60 * 60) {
            timeUnit = '15minute';
        } else if (timeRange >= 30 * 60) {
            timeUnit = '5minute';
        } else {
            timeUnit = 'minute';
        }
        for (let i = 0; i < data.series.length; i++) {
            let series = {
                seriesName: data.series[i],
                values: {},
            };

            let calculatedInterval = data.intervalSec;
            let oneDayInMilliseconds = 24 * 60 * 60;
            switch (calculatedInterval) {
                case calculatedInterval >= 28800:
                    chartStartTime = chartStartTime - oneDayInMilliseconds;
                    chartEndTime = chartEndTime + oneDayInMilliseconds;
                    break;
                case calculatedInterval >= 1200:
                    chartStartTime = chartStartTime - oneDayInMilliseconds;
                    break;
                case calculatedInterval >= 300:
                    chartStartTime = chartStartTime - 60 * 60;
                    break;
                case calculatedInterval >= 120:
                    chartStartTime = chartStartTime - 30 * 60;
                    break;
                case calculatedInterval >= 60:
                    chartStartTime = chartStartTime - 15 * 60;
                    break;
                case calculatedInterval >= 10:
                    chartStartTime = chartStartTime - 5 * 60;
                    break;
                default:
                    chartStartTime = chartStartTime - 1 * 60;
                    chartEndTime = chartEndTime + 1 * 60;
            }
            for (let j = 0; j < data.timestamps.length; j++) {
                // Convert epoch seconds to milliseconds by multiplying by 1000
                let timestampInMilliseconds = data.timestamps[j] * 1000;
                let localDate = moment(timestampInMilliseconds);
                const formattedDate = localDate.format('YYYY-MM-DDTHH:mm:ss');

                series.values[formattedDate] = data.values[i][j];
            }
            while (chartStartTime <= chartEndTime) {
                let timestampInMilliseconds = chartStartTime * 1000;
                let localDate = moment(timestampInMilliseconds);
                const formattedDate = localDate.format('YYYY-MM-DDTHH:mm:ss');
                if (series.values[formattedDate] === undefined) {
                    series.values[formattedDate] = null;
                }
                chartStartTime = chartStartTime + calculatedInterval;
            }
            seriesArray.push(series);
        }
    }

    return seriesArray;
}

async function getMetricNames() {
    const data = {
        start: filterStartDate,
        end: filterEndDate,
    };
    const res = await $.ajax({
        method: 'post',
        url: 'metrics-explorer/api/v1/metric_names',
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            Accept: '*/*',
        },
        crossDomain: true,
        dataType: 'json',
        data: JSON.stringify(data),
    });

    if (res) {
        availableMetrics = res.metricNames;
    }

    return res;
}

async function getMetricsData(queryName, metricName) {
    const query = { name: queryName, query: `(${metricName})`, qlType: 'promql' };
    const queries = [query];
    const formula = { formula: queryName };
    const formulas = [formula];
    const data = { start: filterStartDate, end: filterEndDate, queries: queries, formulas: formulas };

    const res = await fetchTimeSeriesData(data);
    metricsQueryParams = data; // For alerts page

    if (res) {
        rawTimeSeriesData = res;
        updateDownloadButtons();
    }
}

async function getMetricsDataForFormula(formulaId, formulaDetails) {
    let queriesData = [];
    let formulas = [];
    let formulaString = formulaDetails.formula;

    for (let queryName of formulaDetails.queryNames) {
        let queryDetails = queries[queryName];
        let queryString;

        if (queryDetails.state === 'builder') {
            queryString = createQueryString(queryDetails);
        } else {
            queryString = queryDetails.rawQueryInput;
        }

        const query = {
            name: queryName,
            query: queryString,
            qlType: 'promql',
        };
        queriesData.push(query);

        // Replace the query name in the formula string with the query string
        formulaString = formulaString.replace(new RegExp(`\\b${queryName}\\b`, 'g'), queryString);
    }

    const formula = {
        formula: formulaDetails.formula,
    };
    formulas.push(formula);

    const data = {
        start: filterStartDate,
        end: filterEndDate,
        queries: queriesData,
        formulas: formulas,
    };

    metricsQueryParams = data;

    const res = await fetchTimeSeriesData(data);
    if (res) {
        rawTimeSeriesData = res;
    }

    const chartData = await convertDataForChart(rawTimeSeriesData);

    if (isAlertScreen) {
        addVisualizationContainerToAlerts(formulaId, chartData, formulaString);
    } else {
        addVisualizationContainer(formulaId, chartData, formulaString);
    }
    updateDownloadButtons();
}

async function fetchTimeSeriesData(data) {
    return $.ajax({
        method: 'post',
        url: 'metrics-explorer/api/v1/timeseries',
        headers: { 'Content-Type': 'application/json; charset=utf-8', Accept: '*/*' },
        crossDomain: true,
        dataType: 'json',
        data: JSON.stringify(data),
    });
}

function getTagKeyValue(metricName) {
    return new Promise((resolve, reject) => {
        let param = {
            start: filterStartDate,
            end: filterEndDate,
            metric_name: metricName,
        };
        startQueryTime = new Date().getTime();

        $.ajax({
            method: 'post',
            url: 'metrics-explorer/api/v1/all_tags',
            headers: {
                'Content-Type': 'application/json; charset=utf-8',
                Accept: '*/*',
            },
            crossDomain: true,
            dataType: 'json',
            data: JSON.stringify(param),
            success: function (res) {
                const availableEverywhere = [];
                const availableEverything = [];
                if (res && res.tagKeyValueSet) {
                    availableEverything.push(res.uniqueTagKeys);
                    for (let i = 0; i < res.tagKeyValueSet.length; i++) {
                        let cur = res.tagKeyValueSet[i];
                        availableEverywhere.push(cur);
                    }
                }
                resolve({ availableEverywhere, availableEverything });
            },
            error: function (xhr, status, error) {
                reject(error);
            },
        });
    });
}

async function handleQueryAndVisualize(queryName, queryDetails) {
    let queryString;
    if (queryDetails.state === 'builder') {
        queryString = createQueryString(queryDetails);
    } else {
        queryString = queryDetails.rawQueryInput;
    }
    await getMetricsData(queryName, queryString);
    const chartData = await convertDataForChart(rawTimeSeriesData);
    if (isAlertScreen) {
        addVisualizationContainerToAlerts(queryName, chartData, queryString);
    } else {
        addVisualizationContainer(queryName, chartData, queryString);
    }
}

async function getQueryDetails(queryName, queryDetails) {
    if (isAlertScreen) {
        let isActive = $('#metrics-queries .metrics-query:first').find(`.query-name:contains('${queryName}')`).hasClass('active');
        if (isActive) {
            await handleQueryAndVisualize(queryName, queryDetails);
        }
    } else {
        await handleQueryAndVisualize(queryName, queryDetails);
    }

    // Check if the query name is present in any formulas and re-run the formula if so
    for (let formulaId in formulas) {
        if (formulas[formulaId].queryNames.includes(queryName)) {
            await getMetricsDataForFormula(formulaId, formulas[formulaId]);
        }
    }
}

function createQueryString(queryObject) {
    const { metrics, everywhere, everything, aggFunction, functions } = queryObject;

    const everywhereString = everywhere
        .map((tag) => {
            const parts = tag.split(':');
            const tagPart = parts.shift(); // Get the first part as the tag
            const valuePart = parts.join(':'); // Join the remaining parts as the value
            return `${tagPart}="${valuePart}"`;
        })
        .join(',');
    const everythingString = everything.join(',');

    let queryString = '';
    if (everything.length > 0) {
        queryString += `${aggFunction} `;
    }
    if (everythingString) {
        queryString += `(${everythingString}) `;
    }
    queryString += `(${metrics}`;
    if (everywhereString) {
        queryString += `{${everywhereString}}`;
    }

    if (functions && functions.length > 0) {
        functions.forEach((fn) => {
            queryString = `${fn}(${queryString})`;
        });
    }

    queryString += ')';

    return queryString;
}

async function getFunctions() {
    const res = await $.ajax({
        method: 'get',
        url: 'metrics-explorer/api/v1/functions',
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            Accept: '*/*',
        },
        crossDomain: true,
        dataType: 'json',
    });
    if (res) return res;
}

async function refreshMetricsGraphs() {
    dayCnt7 = 0;
    dayCnt2 = 0;
    const newMetricNames = await getMetricNames();
    newMetricNames.metricNames.sort();

    $('.metrics').autocomplete('option', 'source', newMetricNames.metricNames);
    const firstKey = Object.keys(queries)[0];
    if (queries[firstKey].metrics) {
        // only if the first query is not empty
        // Update graph for each query
        Object.keys(queries).forEach(async function (queryName) {
            var queryDetails = queries[queryName];

            const tagsAndValue = await getTagKeyValue(queryDetails.metrics);
            availableEverywhere = tagsAndValue.availableEverywhere.sort();
            availableEverything = tagsAndValue.availableEverything[0].sort();
            const queryElement = $(`.metrics-query .query-name:contains(${queryName})`).closest('.metrics-query');
            queryElement.find('.everywhere').autocomplete('option', 'source', availableEverywhere);
            queryElement.find('.everything').autocomplete('option', 'source', availableEverything);

            await handleQueryAndVisualize(queryName, queryDetails);
        });
    }

    if (Object.keys(formulas).length > 0) {
        // Update graph for each formula
        Object.keys(formulas).forEach(function (formulaId) {
            getMetricsDataForFormula(formulaId, formulas[formulaId]);
        });
    }
}

function updateChartColorsBasedOnTheme() {
    const { gridLineColor, tickColor } = getGraphGridColors();

    for (const queryName in chartDataCollection) {
        if (Object.prototype.hasOwnProperty.call(chartDataCollection, queryName)) {
            const lineChart = lineCharts[queryName];
            lineChart.options.scales.x.ticks.color = tickColor;
            lineChart.options.scales.y.ticks.color = tickColor;
            lineChart.options.scales.y.grid.color = gridLineColor;
            lineChart.update();
        }
    }

    if (mergedGraph) {
        mergedGraph.options.scales.x.ticks.color = tickColor;
        mergedGraph.options.scales.y.ticks.color = tickColor;
        mergedGraph.options.scales.y.grid.color = gridLineColor;
        mergedGraph.update();
    }
}

function getGraphGridColors() {
    const rootStyles = getComputedStyle(document.documentElement);
    const isDarkTheme = document.documentElement.getAttribute('data-theme') === 'dark';
    const gridLineColor = isDarkTheme ? rootStyles.getPropertyValue('--black-3') : rootStyles.getPropertyValue('--white-3');
    const tickColor = isDarkTheme ? rootStyles.getPropertyValue('--white-0') : rootStyles.getPropertyValue('--white-6');

    return { gridLineColor, tickColor };
}

function addVisualizationContainerToAlerts(queryName, seriesData, queryString) {
    addToFormulaCache(queryName, queryString);
    var existingContainer = $(`.metrics-graph`);
    var canvas;
    if (existingContainer.length === 0) {
        var visualizationContainer = $(`
        <div class="metrics-graph">
            <div class="query-string">${queryString}</div>
            <div class="graph-canvas"></div>
        </div>`);

        canvas = $('<canvas></canvas>');
        visualizationContainer.find('.graph-canvas').append(canvas);
        $('#metrics-graphs').append(visualizationContainer);
    } else {
        existingContainer.find('.query-string').text(queryString);
        canvas = $('<canvas></canvas>');
        existingContainer.find('.graph-canvas').empty().append(canvas);
    }

    var lineChart = initializeChart(canvas, seriesData, queryName, chartType);
    lineCharts[queryString] = lineChart;
}

// Parsing function to convert the query string to query object
function parsePromQL(query) {
    const parseObject = {
        metrics: '',
        everywhere: [],
        everything: [],
        aggFunction: 'avg by',
        functions: [],
    };

    // Step 1: Extract the functions
    const functionPattern = new RegExp(`(${functionsArray.join('|')})\\s*\\(`, 'g');
    const functionsFound = [];
    let functionMatch;
    while ((functionMatch = functionPattern.exec(query)) !== null) {
        functionsFound.push(functionMatch[1]);
    }
    parseObject.functions = [...new Set(functionsFound)].reverse(); // Reverse to maintain the correct order

    // Handle the simplest case: if the query is just a metric name without any functions, aggregators, or tags
    const simpleMetricPattern = /\(\(\s*(\w+)\s*\)\)/;
    const simpleMetricMatch = query.match(simpleMetricPattern);
    if (simpleMetricMatch) {
        parseObject.metrics = simpleMetricMatch[1];
        return parseObject;
    }

    // Step 2: Check if there is an aggregator and extract it if present
    let innerQuery = query;
    for (let aggregator of aggregationOptions) {
        const aggPattern = new RegExp(`${aggregator.replace(' ', '\\s*')}\\s*\\(([^)]+)\\)\\s*\\(([^)]+)\\)`, 'i');
        const aggMatch = query.match(aggPattern);
        if (aggMatch) {
            parseObject.aggFunction = aggregator;
            parseObject.everything = aggMatch[1].split(',').map((val) => val.trim());
            innerQuery = aggMatch[2];
            break;
        }
    }

    // Step 3: Extract the metric name and tags from the inner query
    const metricPattern = /(\w+)\{([^}]+)\}/;
    const metricMatch = innerQuery.match(metricPattern);
    if (metricMatch) {
        parseObject.metrics = metricMatch[1];
        parseObject.everywhere = metricMatch[2].split(',').map((tag) => tag.replace(/"/g, '').replace('=', ':'));
    } else {
        // If no tags, just set the metric
        const metricNamePattern = /\s*(\w+)\s*/;
        const metricNameMatch = innerQuery.match(metricNamePattern);
        if (metricNameMatch) {
            parseObject.metrics = metricNameMatch[1];
        } else {
            // Handle the case where metric name is wrapped with functions only
            const wrappedMetricPattern = /\(\s*([\w_]+)\s*\)/;
            let wrappedMetricMatch;
            while ((wrappedMetricMatch = wrappedMetricPattern.exec(innerQuery)) !== null) {
                parseObject.metrics = wrappedMetricMatch[1];
                innerQuery = innerQuery.replace(wrappedMetricMatch[0], wrappedMetricMatch[1]);
            }
        }
    }

    return parseObject;
}

function activateFirstQuery() {
    $('#metrics-queries .metrics-query:first').find('.query-name').addClass('active');
    let queryName = $('#metrics-queries .metrics-query:first').find('.query-name').html();
    let queryDetails = queries[queryName];
    getQueryDetails(queryName, queryDetails);
}

// Add a query element for both the dashboard edit panel and the alert edit panel
async function addQueryElementForAlertAndPanel(queryName, queryDetails) {
    var queryElement = createQueryElementTemplate(queryName);
    $('#metrics-queries').append(queryElement);

    await getMetricNames();
    await populateQueryElement(queryElement, queryDetails);
    await initializeAutocomplete(queryElement, queryDetails);

    // Show or hide the query close icon based on the number of queries
    updateCloseIconVisibility();

    setupQueryElementEventListeners(queryElement);

    queryIndex++;
    updateDownloadButtons();
}

async function populateQueryElement(queryElement, queryDetails) {
    // Set the metric
    queryElement.find('.metrics').val(queryDetails.metrics);

    // Add 'everywhere' tags
    queryDetails.everywhere.forEach((tag) => {
        addTag(queryElement, tag);
    });

    // Add 'everything' values
    queryDetails.everything.forEach((value) => {
        addValue(queryElement, value);
    });

    // Set the aggregation function
    if (queryDetails.aggFunction) {
        queryElement.find('.agg-function').val(queryDetails.aggFunction);
    }

    // Add functions
    queryDetails.functions.forEach((fn) => {
        appendFunctionDiv(queryElement, fn);
    });
}

function appendFunctionDiv(queryElement, fnName) {
    var newDiv = $('<div class="selected-function">' + fnName + '<span class="close">×</span></div>');
    queryElement.find('.all-selected-functions').append(newDiv);
}

function addTag(queryElement, value) {
    var tagContainer = queryElement.find('.everywhere');
    var tag = $('<span class="tag">' + value + '<span class="close">×</span></span>');
    tagContainer.before(tag);

    if (queryElement.find('.tag-container').find('.tag').length === 0) {
        tagContainer.attr('placeholder', '(everywhere)');
        tagContainer.css('width', '100%');
    } else {
        tagContainer.removeAttr('placeholder');
        tagContainer.css('width', '5px');
    }
}

function addValue(queryElement, invalue) {
    var valueContainer = queryElement.find('.everything');
    var value = $('<span class="value">' + invalue + '<span class="close">×</span></span>');
    valueContainer.before(value);

    if (queryElement.find('.value-container').find('.value').length === 0) {
        valueContainer.attr('placeholder', '(everything)');
        valueContainer.css('width', '100%');
    } else {
        valueContainer.removeAttr('placeholder');
        valueContainer.css('width', '5px');
    }
}

function xaxisFomatter(value, index, ticks) {
    const date = new Date(value);
    const previousTick = index > 0 ? new Date(ticks[index - 1].value) : null;

    let isDifferentDay = previousTick && date.getDate() !== previousTick.getDate();
    if (timeUnit === 'month') {
        return isDifferentDay ? date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : null;
    } else if (timeUnit === '7day') {
        if (isDifferentDay) dayCnt7 += 1;
        if (dayCnt7 === 7) {
            dayCnt7 = 0;
            return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        }
        return null;
    } else if (timeUnit === '2day') {
        if (isDifferentDay) dayCnt2 += 1;
        if (dayCnt2 === 2) {
            dayCnt2 = 0;
            return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        }
        return null;
    } else if (timeUnit === '12hour') {
        if (date.getHours() % 12 === 0) {
            return isDifferentDay ? date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : date.toLocaleTimeString(undefined, { hour: 'numeric', hour24: true, minute: '2-digit' });
        }
        return null;
    } else if (timeUnit === '6hour') {
        if (date.getHours() % 6 === 0) {
            return isDifferentDay ? date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : date.toLocaleTimeString(undefined, { hour: 'numeric', hour24: true, minute: '2-digit' });
        }
        return null;
    } else if (timeUnit === '3hour') {
        if (date.getHours() % 3 === 0) {
            return isDifferentDay ? date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : date.toLocaleTimeString(undefined, { hour: 'numeric', hour24: true, minute: '2-digit' });
        }
        return null;
    } else if (timeUnit === '30minute') {
        if (date.getMinutes() % 30 === 0 || date.getMinutes() === 0) {
            return isDifferentDay ? date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : date.toLocaleTimeString(undefined, { hour: 'numeric', hour24: true, minute: '2-digit' });
        }
        return null;
    } else if (timeUnit === '15minute') {
        if (date.getMinutes() % 15 === 0 || date.getMinutes() === 0) {
            return isDifferentDay ? date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : date.toLocaleTimeString(undefined, { hour: 'numeric', hour24: true, minute: '2-digit' });
        }
        return null;
    } else if (timeUnit === '5minute') {
        if (date.getMinutes() % 5 === 0 || date.getMinutes() === 0) {
            return isDifferentDay ? date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : date.toLocaleTimeString(undefined, { hour: 'numeric', hour24: true, minute: '2-digit' });
        }
        return null;
    } else {
        return isDifferentDay ? date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : date.toLocaleTimeString(undefined, { hour: 'numeric', hour24: true, minute: '2-digit' });
    }
}

$('#alert-from-metrics-btn').click(function () {
    let mqueries = [];
    let mformulas = [];
    let queryString;
    var queryParams = {};
    const firstKey = Object.keys(queries)[0];
    if (queries[firstKey].metrics) {
        // only if the first query is not empty
        Object.keys(queries).forEach(function (queryName) {
            var queryDetails = queries[queryName];
            if (queryDetails.state === 'builder') {
                queryString = createQueryString(queryDetails);
            } else {
                queryString = queryDetails.rawQueryInput;
            }
            const formula = { formula: queryName };
            mformulas.push(formula);
            const tquery = { name: queryName, query: `(${queryString})`, qlType: 'promql' };
            mqueries.push(tquery);
        });
    }
    if (Object.keys(formulas).length > 0) {
        mformulas = [];
        Object.keys(formulas).forEach(function (formulaId) {
            let formulaDetails = formulas[formulaId];
            const formula = {
                formula: formulaDetails.formula,
            };
            mformulas.push(formula);
        });
    }
    if (Object.keys(formulas).length === 0 && Object.keys(queries).length > 1) {
        let queryNames = Object.keys(queries);
        let formulaInput = queryNames.join(' + ');
        mformulas = [formulaInput];
    }
    queryParams = {
        queryLanguage: 'PromQL',
        queries: mqueries,
        formulas: mformulas,
        start: filterStartDate,
        end: filterEndDate,
        alert_type: 2,
        labels: [],
    };
    let jsonString = JSON.stringify(queryParams);
    queryString = encodeURIComponent(jsonString);
    var newTab = window.open('../alert.html?queryString=' + queryString, '_blank');
    newTab.focus();
});

async function populateMetricsQueryElement(metricsQueryParams) {
    const { start, end, queries, formulas } = metricsQueryParams;
    if (!isNaN(start)) {
        let stDate = Number(start);
        let endDate = Number(end);
        datePickerHandler(stDate, endDate, 'custom');
        loadCustomDateTimeFromEpoch(stDate, endDate);
    } else {
        $(`.ranges .inner-range #${start}`).addClass('active');
        datePickerHandler(start, end, start);
    }

    if (functionsArray) {
        const allFunctions = await getFunctions();
        functionsArray = allFunctions.map((item) => item.fn);
    }

    for (const query of queries) {
        const parsedQueryObject = parsePromQL(query.query);
        await addQueryElementForAlertAndPanel(query.name, parsedQueryObject);
    }

    if (queries.length >= 1) {
        await addAlertsFormulaElement(formulas[0].formula);
    }
}
