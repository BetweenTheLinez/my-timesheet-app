import React, { useState, useEffect, useCallback } from 'react';

// Helper function to convert time string (HH:MM) to minutes from midnight
const timeToMinutes = (timeString) => {
    if (!timeString) return 0;
    const [hours, minutes] = timeString.split(':').map(Number);
    return hours * 60 + minutes;
};

// Helper function to format decimal hours to H.HH (e.g., 8.50)
const formatDecimalHours = (minutes) => {
    if (isNaN(minutes) || minutes < 0) return '0.00';
    const hours = minutes / 60;
    return hours.toFixed(2);
};

// Initial structure for a single job entry
const createInitialJob = () => ({
    id: crypto.randomUUID(), // Unique ID for each job
    jobNumber: '',
    jobLocation: '',
    travelStartTime: '',
    workStartTime: '',
    workFinishTime: '',
    travelHomeTime: '',
    totalTimeWorkedMinutes: 0,
});

// Function to get today's date in Walpole-MM-DD format
const getTodayDate = () => {
    const today = new Date();
    return today.toISOString().split('T')[0];
};

// Function to get day of week from date
const getDayOfWeek = (dateString) => {
    if (!dateString) return '';
    try {
        const date = new Date(dateString + 'T00:00:00'); // Add T00:00:00 to avoid timezone issues
        const options = { weekday: 'long' };
        return new Intl.DateTimeFormat('en-US', options).format(date);
    } catch (e) {
        console.error("Invalid date string for getDayOfWeek:", dateString, e);
        return '';
    }
};

// Function to get Monday of the current week (for initial weekly report start date)
const getMondayOfCurrentWeek = () => {
    const d = new Date();
    d.setHours(0, 0, 0, 0); // Set to start of the day to avoid time component issues
    const day = d.getDay(); // 0 for Sunday, 1 for Monday, ..., 6 for Saturday
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // If Sunday (0), go back 6 days. Otherwise, go back (day - 1) days.
    d.setDate(diff);
    return d.toISOString().split('T')[0];
};

// Function to get Sunday of the current week (for initial weekly report end date)
const getSundayOfCurrentWeek = () => {
    const monday = new Date(getMondayOfCurrentWeek() + 'T00:00:00'); // Get Monday as a Date object
    monday.setDate(monday.getDate() + 6); // Add 6 days to Monday to get Sunday
    return monday.toISOString().split('T')[0];
};

// Helper function to sanitize a string for use in a filename
const sanitizeFilename = (name) => {
    return name.replace(/[^a-z0-9_.-]/gi, '_'); // Replace non-alphanumeric, non-underscore, non-dot, non-dash with underscore
};


const App = () => {
    // Global state for Employee Name and Truck Number, now NOT persisted in localStorage
    const [employeeName, setEmployeeName] = useState(''); // Initialize as empty string
    const [truckNumber, setTruckNumber] = useState('');   // Initialize as empty string

    // Removed useEffects for localStorage persistence of employeeName and truckNumber


    // State to store all weekly data, keyed by date (YYYY-MM-DD)
    const [weeklyData, setWeeklyData] = useState({});
    
    // State for the currently selected date (for daily input)
    const [selectedDate, setSelectedDate] = useState(getTodayDate());

    const [generatedDailyReport, setGeneratedDailyReport] = useState('');
    const [generatedWeeklyReport, setGeneratedWeeklyReport] = useState('');
    const [isGeneratingReport, setIsGeneratingReport] = useState(false);
    const [reportError, setReportError] = useState('');

    // New states for weekly report date range
    const [weeklyReportStartDate, setWeeklyReportStartDate] = useState(getMondayOfCurrentWeek());
    const [weeklyReportEndDate, setWeeklyReportEndDate] = useState(getSundayOfCurrentWeek());
    // New state for recipient email
    const [recipientEmail, setRecipientEmail] = useState('');

    // --- Derived state for current day's data ---
    const currentDayData = weeklyData[selectedDate] || {
        jobs: Array(3).fill(null).map(() => createInitialJob()),
        dayOfWeek: getDayOfWeek(selectedDate),
        totalHours: 0,
        netHours: 0,
        isOnCall: false,
    };
    const currentJobs = currentDayData.jobs;
    const currentDayOfWeek = currentDayData.dayOfWeek;
    const currentTotalHours = currentDayData.totalHours;
    const currentNetHours = currentDayData.netHours;
    const currentIsOnCall = currentDayData.isOnCall;


    // Refactored: Calculate total time worked for a single job
    // This now finds the earliest start and latest end among all provided times for a job.
    const calculateJobTotal = useCallback((job) => {
        const times = [
            timeToMinutes(job.travelStartTime),
            timeToMinutes(job.workStartTime),
            timeToMinutes(job.workFinishTime),
            timeToMinutes(job.travelHomeTime)
        ].filter(t => t > 0); // Filter out 0 for blank/invalid times

        if (times.length < 2) { // Need at least two valid time points to calculate a duration
            return 0;
        }

        const minTime = Math.min(...times);
        const maxTime = Math.max(...times);

        return maxTime - minTime;
    }, []);

    // EFFECT: Recalculate current day's totals and save to weeklyData
    useEffect(() => {
        let sumTotalMinutes = 0;
        currentJobs.forEach(job => {
            const jobTotal = calculateJobTotal(job);
            sumTotalMinutes += jobTotal;
        });

        let currentNetMinutes = sumTotalMinutes;

        // Deduct 1 hour travel if workday > 6 hours AND NOT on-call
        if (sumTotalMinutes / 60 > 6 && !currentIsOnCall) { 
            currentNetMinutes -= 60;
        }

        // Deduct 30 minutes lunch if workday > 4 hours
        if (sumTotalMinutes / 60 > 4) {
            currentNetMinutes -= 30;
        }

        const finalNetMinutes = Math.max(0, currentNetMinutes);

        // Update the weeklyData with the latest calculations and header info for the selected day
        setWeeklyData(prevWeeklyData => ({
            ...prevWeeklyData,
            [selectedDate]: {
                ...prevWeeklyData[selectedDate], // Keep existing properties if any
                jobs: currentJobs,                 // Use derived currentJobs
                dayOfWeek: getDayOfWeek(selectedDate),
                totalHours: sumTotalMinutes,
                netHours: finalNetMinutes,
                isOnCall: currentIsOnCall, // Save isOnCall status
            }
        }));

        setGeneratedDailyReport('');
        setGeneratedWeeklyReport('');
        setReportError('');

    }, [currentJobs, calculateJobTotal, selectedDate, currentIsOnCall]); // Dependencies adjusted


    // Handle input changes for main header fields (Employee Name, Truck Number, On-Call)
    // EmployeeName and TruckNumber are handled by their own useState/useEffect
    const handleHeaderInputChange = (field, value) => {
        if (field === 'employeeName') {
            setEmployeeName(value);
        } else if (field === 'truckNumber') {
            setTruckNumber(value);
        } else { // For isOnCall checkbox
            setWeeklyData(prevWeeklyData => ({
                ...prevWeeklyData,
                [selectedDate]: {
                    ...prevWeeklyData[selectedDate], // Keep existing properties
                    jobs: prevWeeklyData[selectedDate]?.jobs || Array(3).fill(null).map(() => createInitialJob()), // Ensure jobs array exists if new day
                    dayOfWeek: getDayOfWeek(selectedDate),
                    [field]: value, // Update the specific field directly in weeklyData
                }
            }));
        }
    };

    // Handle input changes for job rows
    const handleJobInputChange = (jobId, field, value) => {
        setWeeklyData(prevWeeklyData => {
            const dayData = prevWeeklyData[selectedDate] || {
                jobs: [],
                dayOfWeek: getDayOfWeek(selectedDate),
                totalHours: 0,
                netHours: 0,
                isOnCall: false,
            };

            const updatedJobs = dayData.jobs.map(job => {
                if (job.id === jobId) {
                    const newJob = { ...job, [field]: value };
                    newJob.totalTimeWorkedMinutes = calculateJobTotal(newJob);
                    return newJob;
                }
                return job;
            });

            return {
                ...prevWeeklyData,
                [selectedDate]: {
                    ...dayData, // Keep existing day data
                    jobs: updatedJobs, // Update jobs array
                }
            };
        });
    };

    // Add a new job row for the current day
    const handleAddJob = () => {
        setWeeklyData(prevWeeklyData => {
            const dayData = prevWeeklyData[selectedDate] || {
                jobs: [],
                dayOfWeek: getDayOfWeek(selectedDate),
                totalHours: 0,
                netHours: 0,
                isOnCall: false,
            };

            if (dayData.jobs.length < 12) {
                const updatedJobs = [...dayData.jobs, createInitialJob()];
                return {
                    ...prevWeeklyData,
                    [selectedDate]: {
                        ...dayData,
                        jobs: updatedJobs,
                    }
                };
            } else {
                console.log("Maximum 12 jobs allowed per day.");
                return prevWeeklyData;
            }
        });
    };

    // Remove a job row from the current day
    const handleRemoveJob = (jobId) => {
        setWeeklyData(prevWeeklyData => {
            const dayData = prevWeeklyData[selectedDate] || { jobs: [] };
            const updatedJobs = dayData.jobs.filter(job => job.id !== jobId);
            return {
                ...prevWeeklyData,
                [selectedDate]: {
                    ...dayData,
                    jobs: updatedJobs,
                }
            };
        });
    };

    // Function to generate the daily report using Gemini API
    const generateDailyReport = async () => {
        setIsGeneratingReport(true);
        setGeneratedDailyReport('');
        setReportError('');

        const apiKey = "AIzaSyDhV319hIAYhrBAsDaMLMnCO5RlBA0ml3U"; 
        if (!apiKey) {
            setReportError("API Key is not configured. Please add your API key to src/App.js.");
            setIsGeneratingReport(false);
            console.error("Gemini API Key is missing.");
            return;
        }

        let prompt = `Generate a concise daily timesheet summary based on the following information.
        
        **Instructions for AI:**
        - Format the output as a simple, easy-to-read text block or bulleted list.
        - ABSOLUTELY NO TABLES, MARKDOWN TABLES, OR ASCII ART TABLES.
        - Focus on clarity and readability for an email.

Employee Name: ${employeeName || 'N/A'}
Truck Number: ${truckNumber || 'N/A'}
Date: ${selectedDate || 'N/A'}
Day of Week: ${currentDayOfWeek || 'N/A'}
On-Call Day: ${currentIsOnCall ? 'Yes' : 'No'}

Job Details:
`;
        if (currentJobs.length === 0 || currentJobs.every(job => !job.jobNumber && !job.jobLocation && !job.travelStartTime && !job.workStartTime && !job.workFinishTime && !job.travelHomeTime)) {
            prompt += "No job entries for this day.\n";
        } else {
            prompt += "Jobs for today:\n"; 
            currentJobs.forEach((job, index) => {
                if (job.jobNumber || job.jobLocation || job.travelStartTime || job.workStartTime || job.workFinishTime || job.travelHomeTime) {
                    prompt += `- Job Number: ${job.jobNumber || 'N/A'}\n`;
                    prompt += `  Location: ${job.jobLocation || 'N/A'}\n`;
                    prompt += `  Travel Start: ${job.travelStartTime || 'N/A'}\n`;
                    prompt += `  Work Start: ${job.workStartTime || 'N/A'}\n`;
                    prompt += `  Work Finish: ${job.workFinishTime || 'N/A'}\n`;
                    prompt += `  Travel Home Arrival: ${job.travelHomeTime || 'N/A'}\n`;
                    prompt += `  Total Time for Job: ${formatDecimalHours(job.totalTimeWorkedMinutes)} Hrs\n`;
                    prompt += `\n`; 
                }
            });
        }

        prompt += `
Summary for ${currentDayOfWeek}, ${selectedDate}:
Total Hours for All Jobs: ${formatDecimalHours(currentTotalHours)} Hrs
Net Working Hours: ${formatDecimalHours(currentNetHours)} Hrs
`;

        try {
            let chatHistory = [];
            chatHistory.push({ role: "user", parts: [{ text: prompt }] });
            const payload = { contents: chatHistory };
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const result = await response.json();
            console.log("Gemini Daily Report API Response:", result); // Log the full response

            if (result.candidates && result.candidates.length > 0 &&
                result.candidates[0].content && result.candidates[0].content.parts &&
                result.candidates[0].content.parts.length > 0 && result.candidates[0].content.parts[0].text) {
                const text = result.candidates[0].content.parts[0].text;
                setGeneratedDailyReport(text);
            } else {
                setReportError("Failed to generate daily report. Unexpected API response structure or empty content.");
                console.error("Gemini Daily Report API response structure unexpected or empty content:", result);
            }
        } catch (error) {
            setReportError(`Error generating daily report: ${error.message}`);
            console.error("Error calling Gemini API for daily report:", error);
        } finally {
            setIsGeneratingReport(false);
        }
    };

    // Function to generate the weekly report using Gemini API
    const generateWeeklyReport = async () => {
        setIsGeneratingReport(true);
        setGeneratedWeeklyReport('');
        setReportError('');

        const apiKey = "AIzaSyDhV319hIAYhrBAsDaMLMnCO5RlBA0ml3U"; 
        if (!apiKey) {
            setReportError("API Key is not configured. Please add your API key to src/App.js.");
            setIsGeneratingReport(false);
            console.error("Gemini API Key is missing.");
            return;
        }

        let prompt = `Generate a comprehensive weekly timesheet summary for payroll based on the following daily information.
        
        **Instructions for AI:**
        - Format the output as a simple, easy-to-read text block or bulleted list.
        - ABSOLUTELY NO TABLES, MARKDOWN TABLES, OR ASCII ART TABLES.
        - Focus on clarity and readability for an email.
        - Ensure all time entries (Travel Start, Work Start, Work Finish, Travel Home Arrival) are explicitly listed for each job.
        - Clearly state if a day was "On-Call" and explain the travel deduction rule for on-call days in the final summary.

Employee Name: ${employeeName || 'N/A'}
Truck Number: ${truckNumber || 'N/A'}
Week of: ${weeklyReportStartDate} to ${weeklyReportEndDate}

--- Daily Breakdown ---
`;

        let totalWeeklyHours = 0;
        let totalWeeklyNetHours = 0;
        const datesToReport = Object.keys(weeklyData).filter(dateStr => {
            return dateStr >= weeklyReportStartDate && dateStr <= weeklyReportEndDate;
        }).sort();

        if (datesToReport.length === 0) {
            prompt += `No timesheet data entered for the selected week.\n`;
        } else {
            datesToReport.forEach(date => {
                const dayData = weeklyData[date];
                const dayOfWeekForReport = getDayOfWeek(date);

                prompt += `\n${dayOfWeekForReport}, ${date}:\n`;
                prompt += `  Total Hours: ${formatDecimalHours(dayData.totalHours || 0)} Hrs\n`;
                prompt += `  Net Working Hours: ${formatDecimalHours(dayData.netHours || 0)} Hrs\n`;
                prompt += `  On-Call Day: ${dayData.isOnCall ? 'Yes' : 'No'}\n`;
                
                if (!dayData || dayData.jobs.length === 0 || dayData.jobs.every(job => !job.jobNumber && !job.jobLocation && !job.travelStartTime && !job.workStartTime && !job.workFinishTime && !job.travelHomeTime)) {
                    prompt += "  Jobs: No job entries recorded.\n";
                } else {
                    prompt += "  Jobs:\n";
                    dayData.jobs.forEach((job, index) => {
                        if (job.jobNumber || job.jobLocation || job.travelStartTime || job.workStartTime || job.workFinishTime || job.travelHomeTime) {
                            prompt += `    - Job Number: ${job.jobNumber || 'N/A'}\n`;
                            prompt += `      Location: ${job.jobLocation || 'N/A'}\n`;
                            prompt += `      Travel Start: ${job.travelStartTime || 'N/A'}\n`;
                            prompt += `      Work Start: ${job.workStartTime || 'N/A'}\n`;
                            prompt += `      Work Finish: ${job.workFinishTime || 'N/A'}\n`;
                            prompt += `      Travel Home Arrival: ${job.travelHomeTime || 'N/A'}\n`;
                            prompt += `      Total for job: ${formatDecimalHours(job.totalTimeWorkedMinutes)} Hrs\n`;
                            prompt += `\n`; // Add a blank line for readability between jobs
                        }
                    });
                }
                totalWeeklyHours += (dayData.totalHours || 0);
                totalWeeklyNetHours += (dayData.netHours || 0);
            });
        }

        prompt += `
--- Overall Weekly Summary ---
Total Hours for the Week: ${formatDecimalHours(totalWeeklyHours)} Hrs
Total Net Working Hours for the Week: ${formatDecimalHours(totalWeeklyNetHours)} Hrs

Note on Travel Deduction: For days marked as "On-Call", the standard 1-hour travel time deduction is NOT applied to the Net Working Hours calculation.
`; 

        try {
            let chatHistory = [];
            chatHistory.push({ role: "user", parts: [{ text: prompt }] });
            const payload = { contents: chatHistory };
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const result = await response.json();
            console.log("Gemini Weekly Report API Response:", result); // Log the full response

            if (result.candidates && result.candidates.length > 0 &&
                result.candidates[0].content && result.candidates[0].content.parts &&
                result.candidates[0].content.parts.length > 0 && result.candidates[0].content.parts[0].text) {
                const text = result.candidates[0].content.parts[0].text;
                setGeneratedWeeklyReport(text);
            } else {
                setReportError("Failed to generate weekly report. Unexpected API response structure or empty content.");
                console.error("Gemini Weekly Report API response structure unexpected or empty content:", result);
            }
        } catch (error) {
            setReportError(`Error generating weekly report: ${error.message}`);
            console.error("Error calling Gemini API for weekly report:", error);
        } finally {
            setIsGeneratingReport(false);
        }
    };

    // Function to handle sharing via email
    const handleShareViaEmail = () => {
        if (!generatedWeeklyReport) {
            setReportError("Please generate the weekly report first before sharing.");
            return;
        }
        if (!recipientEmail) {
            setReportError("Please enter a recipient email address to share the report.");
            return;
        }

        const subject = encodeURIComponent(`Weekly Timesheet Report - ${employeeName || 'N/A'} - Week of ${weeklyReportStartDate} to ${weeklyReportEndDate}`);
        const body = encodeURIComponent(generatedWeeklyReport);

        const mailtoLink = `mailto:${recipientEmail}?subject=${subject}&body=${body}`;

        window.location.href = mailtoLink;
        setReportError(''); // Clear any previous error messages
    };

    // Function to generate and download DAILY CSV
    const generateDailyCsvReport = () => {
        let csvContent = "data:text/csv;charset=utf-8,";
        
        // Header row for main info
        csvContent += `Daily Timesheet for Pro-Air Mechanical\n`;
        csvContent += `Employee Name:,${employeeName || ''}\n`;
        csvContent += `Truck Number:,${truckNumber || ''}\n`;
        csvContent += `Date:,${selectedDate || ''}\n`;
        csvContent += `Day of Week:,${currentDayOfWeek || ''}\n`;
        csvContent += `On-Call Day:,${currentIsOnCall ? 'Yes' : 'No'}\n\n`;

        // Column headers for job entries
        csvContent += "Job Number,Job Location,Travel Start,Work Start,Work Finish,Travel Home Arrival,Job Hours\n";

        if (currentJobs.length === 0 || currentJobs.every(job => !job.jobNumber && !job.jobLocation && !job.travelStartTime && !job.workStartTime && !job.workFinishTime && !job.travelHomeTime)) {
            csvContent += `No job entries for this day.\n`;
        } else {
            currentJobs.forEach(job => {
                csvContent += `"${job.jobNumber || ''}",`;
                csvContent += `"${job.jobLocation || ''}",`;
                csvContent += `"${job.travelStartTime || ''}",`;
                csvContent += `"${job.workStartTime || ''}",`;
                csvContent += `"${job.workFinishTime || ''}",`;
                csvContent += `"${job.travelHomeTime || ''}",`;
                csvContent += `${formatDecimalHours(job.totalTimeWorkedMinutes)}\n`;
            });
        }

        // Add daily totals
        csvContent += `\nTotal Hours for All Jobs:,${formatDecimalHours(currentTotalHours)}\n`;
        csvContent += `Net Working Hours:,${formatDecimalHours(currentNetHours)}\n`;
        csvContent += `Note: Travel deduction is skipped for On-Call days if applicable.\n`;

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        const filename = `${sanitizeFilename(employeeName || 'Employee')}_Daily_Timesheet_${selectedDate}.csv`;
        link.setAttribute("download", filename);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };


    // Function to generate and download WEEKLY CSV
    const generateCsvReport = () => {
        let csvContent = "data:text/csv;charset=utf-8,";
        
        // Header row for main info
        csvContent += `Weekly Timesheet for Pro-Air Mechanical\n`;
        csvContent += `Employee Name:,${employeeName || ''}\n`;
        csvContent += `Truck Number:,${truckNumber || ''}\n`;
        csvContent += `Week of:,${weeklyReportStartDate} to ${weeklyReportEndDate}\n\n`;

        // Column headers for job entries
        csvContent += "Day,Date,Total Daily Hours,Net Daily Hours,On-Call,Job Number,Job Location,Travel Start,Work Start,Work Finish,Travel Home Arrival,Job Hours\n";

        const datesToReport = Object.keys(weeklyData).filter(dateStr => {
            return dateStr >= weeklyReportStartDate && dateStr <= weeklyReportEndDate;
        }).sort();

        if (datesToReport.length === 0) {
            csvContent += `No timesheet data entered for the selected week.\n`;
        } else {
            datesToReport.forEach(date => {
                const dayData = weeklyData[date];
                const dayOfWeekForReport = getDayOfWeek(date);

                if (!dayData || dayData.jobs.length === 0 || dayData.jobs.every(job => !job.jobNumber && !job.jobLocation && !job.travelStartTime && !job.workStartTime && !job.workFinishTime && !job.travelHomeTime)) {
                    csvContent += `${dayOfWeekForReport},${date},${formatDecimalHours(dayData.totalHours || 0)},${formatDecimalHours(dayData.netHours || 0)},${dayData.isOnCall ? 'Yes' : 'No'},,,,,,\n`;
                } else {
                    dayData.jobs.forEach((job, index) => {
                        const isFirstJobOfDay = index === 0;
                        csvContent += `${isFirstJobOfDay ? dayOfWeekForReport : ''},`;
                        csvContent += `${isFirstJobOfDay ? date : ''},`;
                        csvContent += `${isFirstJobOfDay ? formatDecimalHours(dayData.totalHours || 0) : ''},`;
                        csvContent += `${isFirstJobOfDay ? formatDecimalHours(dayData.netHours || 0) : ''},`;
                        csvContent += `${isFirstJobOfDay ? (dayData.isOnCall ? 'Yes' : 'No') : ''},`;
                        csvContent += `"${job.jobNumber || ''}",`; // Wrap in quotes to handle commas
                        csvContent += `"${job.jobLocation || ''}",`;
                        csvContent += `"${job.travelStartTime || ''}",`;
                        csvContent += `"${job.workStartTime || ''}",`;
                        csvContent += `"${job.workFinishTime || ''}",`;
                        csvContent += `"${job.travelHomeTime || ''}",`;
                        csvContent += `${formatDecimalHours(job.totalTimeWorkedMinutes)}\n`;
                    });
                }
            });
        }

        // Add weekly totals
        let totalWeeklyHours = 0;
        let totalWeeklyNetHours = 0;
        datesToReport.forEach(date => {
            totalWeeklyHours += (weeklyData[date]?.totalHours || 0);
            totalWeeklyNetHours += (weeklyData[date]?.netHours || 0);
        });
        csvContent += `\nTotal Weekly Hours:,${formatDecimalHours(totalWeeklyHours)}\n`;
        csvContent += `Total Weekly Net Hours:,${formatDecimalHours(totalWeeklyNetHours)}\n`;
        csvContent += `Note on Travel Deduction: For days marked as "On-Call", the standard 1-hour travel time deduction is NOT applied to the Net Working Hours calculation.\n`;

        const encodedUri = encodeURI(csvContent);
        const link = document.createElement("a");
        link.setAttribute("href", encodedUri);
        const filename = `${sanitizeFilename(employeeName || 'Employee')}_Weekly_Timesheet_${weeklyReportStartDate}_to_${weeklyReportEndDate}.csv`;
        link.setAttribute("download", filename);
        document.body.appendChild(link); // Required for Firefox
        link.click();
        document.body.removeChild(link); // Clean up
    };


    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-100 to-indigo-200 p-4 sm:p-6 font-inter text-gray-800">
            <div className="max-w-6xl mx-auto bg-white shadow-xl rounded-xl p-6 sm:p-8">
                <h1 className="text-3xl sm:text-4xl font-extrabold text-center text-blue-800 mb-6">
                    Timesheet for Pro-Air Mechanical
                </h1>

                {/* Header Information */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                    <div className="flex flex-col">
                        <label htmlFor="employeeName" className="text-sm font-medium text-gray-700 mb-1">Employee Name</label>
                        <input
                            type="text"
                            id="employeeName"
                            className="p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                            value={employeeName} // Uses global state
                            onChange={(e) => handleHeaderInputChange('employeeName', e.target.value)}
                            placeholder="John Doe"
                        />
                    </div>
                    <div className="flex flex-col">
                        <label htmlFor="truckNumber" className="text-sm font-medium text-gray-700 mb-1">Truck Number</label>
                        <input
                            type="text"
                            id="truckNumber"
                            className="p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                            value={truckNumber} // Uses global state
                            onChange={(e) => handleHeaderInputChange('truckNumber', e.target.value)}
                            placeholder="TRK-123"
                        />
                    </div>
                    <div className="flex flex-col">
                        <label htmlFor="date" className="text-sm font-medium text-gray-700 mb-1">Date</label>
                        <input
                            type="date"
                            id="date"
                            className="p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                            value={selectedDate}
                            onChange={(e) => setSelectedDate(e.target.value)}
                        />
                    </div>
                    <div className="flex flex-col">
                        <label htmlFor="dayOfWeek" className="text-sm font-medium text-gray-700 mb-1">Day of Week</label>
                        <input
                            type="text"
                            id="dayOfWeek"
                            className="p-2 border border-gray-300 rounded-md bg-gray-100 cursor-not-allowed"
                            value={currentDayOfWeek}
                            readOnly
                        />
                    </div>
                    {/* On-Call Checkbox */}
                    <div className="flex flex-col col-span-full sm:col-span-2 lg:col-span-1 items-start sm:items-center">
                        <input
                            type="checkbox"
                            id="isOnCall"
                            className="mr-2 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                            checked={currentIsOnCall}
                            onChange={(e) => handleHeaderInputChange('isOnCall', e.target.checked)}
                        />
                        <label htmlFor="isOnCall" className="text-sm font-medium text-gray-700 cursor-pointer">On-Call Day</label>
                    </div>
                </div>

                {/* Job Entries Table */}
                <div className="overflow-x-auto mb-8 border border-gray-200 rounded-lg shadow-sm">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-blue-50">
                            <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">#</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Job Number</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Job Location</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Travel Start</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Work Start</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Work Finish</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Travel Home Arrival</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Total Time Worked (Hrs)</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {currentJobs.map((job, index) => (
                                <tr key={job.id} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                                    <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">{index + 1}</td>
                                    <td className="px-4 py-3 whitespace-nowrap">
                                        <input
                                            type="text"
                                            className="w-24 p-1 border border-gray-300 rounded-md text-sm"
                                            value={job.jobNumber}
                                            onChange={(e) => handleJobInputChange(job.id, 'jobNumber', e.target.value)}
                                        />
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap">
                                        <input
                                            type="text"
                                            className="w-32 p-1 border border-gray-300 rounded-md text-sm"
                                            value={job.jobLocation}
                                            onChange={(e) => handleJobInputChange(job.id, 'jobLocation', e.target.value)}
                                        />
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap">
                                        <input
                                            type="time"
                                            className="w-28 p-1 border border-gray-300 rounded-md text-sm"
                                            value={job.travelStartTime}
                                            onChange={(e) => handleJobInputChange(job.id, 'travelStartTime', e.target.value)}
                                        />
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap">
                                        <input
                                            type="time"
                                            className="w-28 p-1 border border-gray-300 rounded-md text-sm"
                                            value={job.workStartTime}
                                            onChange={(e) => handleJobInputChange(job.id, 'workStartTime', e.target.value)}
                                        />
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap">
                                        <input
                                            type="time"
                                            className="w-28 p-1 border border-gray-300 rounded-md text-sm"
                                            value={job.workFinishTime}
                                            onChange={(e) => handleJobInputChange(job.id, 'workFinishTime', e.target.value)}
                                        />
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap">
                                        <input
                                            type="time"
                                            className="w-28 p-1 border border-gray-300 rounded-md text-sm"
                                            value={job.travelHomeTime}
                                            onChange={(e) => handleJobInputChange(job.id, 'travelHomeTime', e.target.value)}
                                        />
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-700 font-semibold">
                                        {formatDecimalHours(job.totalTimeWorkedMinutes)}
                                    </td>
                                    <td className="px-4 py-3 whitespace-nowrap">
                                        {currentJobs.length > 1 && (
                                            <button
                                                onClick={() => handleRemoveJob(job.id)}
                                                className="bg-red-500 hover:bg-red-600 text-white font-bold py-1 px-2 rounded-md text-xs transition duration-200 ease-in-out transform hover:scale-105"
                                            >
                                                Remove
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className="flex justify-center mb-8">
                    <button
                        onClick={handleAddJob}
                        disabled={currentJobs.length >= 12}
                        className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg shadow-md transition duration-200 ease-in-out transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Add Job Row for Current Day
                    </button>
                </div>

                {/* Daily Summary Section */}
                <div className="bg-blue-50 p-6 rounded-lg shadow-inner border border-blue-200 mb-8">
                    <h2 className="text-xl font-bold text-blue-700 mb-4">Daily Summary for {currentDayOfWeek}, {selectedDate}</h2>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-lg">
                        <div className="flex justify-between items-center bg-white p-3 rounded-md shadow-sm">
                            <span className="font-medium text-gray-700">Total Hours for All Jobs:</span>
                            <span className="font-bold text-blue-800">{formatDecimalHours(currentTotalHours)} Hrs</span>
                        </div>
                        <div className="flex justify-between items-center bg-white p-3 rounded-md shadow-sm">
                            <span className="font-medium text-gray-700">Net Working Hours:</span>
                            <span className="font-bold text-green-700">{formatDecimalHours(currentNetHours)} Hrs</span>
                        </div>
                    </div>
                    <p className="text-sm text-gray-600 mt-4">
                        *Net Working Hours deducts 1 hour of travel if the total workday exceeds 6 hours, and 30 minutes for lunch if the total workday exceeds 4 hours.
                        {currentIsOnCall && " (Note: Travel deduction is skipped for On-Call days.)"}
                    </p>

                    {/* Gemini API Feature: Generate Daily Report */}
                    <div className="mt-6 pt-4 border-t border-blue-200">
                        <button
                            onClick={generateDailyReport}
                            disabled={isGeneratingReport}
                            className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-3 px-4 rounded-lg shadow-md transition duration-200 ease-in-out transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                        >
                            {isGeneratingReport ? (
                                <>
                                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    Generating Daily Report...
                                </>
                            ) : (
                                <>
                                    ✨ Generate Daily Report for Current Day ✨
                                </>
                            )}
                        </button>

                        {generatedDailyReport && (
                            <div className="mt-4 bg-white p-4 rounded-md shadow-sm border border-gray-200">
                                <h3 className="text-lg font-semibold text-gray-800 mb-2">Generated Daily Report:</h3>
                                <p className="text-gray-700 whitespace-pre-wrap">{generatedDailyReport}</p>
                            </div>
                        )}

                        {/* Download Daily Summary as CSV Button */}
                        <div className="mt-4 pt-4 border-t border-gray-200 flex justify-center">
                            <button
                                onClick={generateDailyCsvReport}
                                className="bg-blue-700 hover:bg-blue-800 text-white font-bold py-2 px-4 rounded-lg shadow-md transition duration-200 ease-in-out transform hover:scale-105 flex items-center justify-center text-sm w-full sm:w-auto"
                            >
                                ⬇️ Download Daily Summary as CSV
                            </button>
                        </div>
                    </div>
                </div>

                {/* Weekly Summary Section */}
                <div className="bg-green-50 p-6 rounded-lg shadow-inner border border-green-200">
                    <h2 className="text-xl font-bold text-green-700 mb-4">Weekly Summary & Report for Payroll</h2>
                    <p className="text-sm text-gray-600 mb-4">
                        Select a date range for your weekly report. Only days with entered data within this range will be included.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                        <div className="flex flex-col">
                            <label htmlFor="weeklyStartDate" className="text-sm font-medium text-gray-700 mb-1">Report Start Date</label>
                            <input
                                type="date"
                                id="weeklyStartDate"
                                className="p-2 border border-gray-300 rounded-md focus:ring-green-500 focus:border-green-500"
                                value={weeklyReportStartDate}
                                onChange={(e) => setWeeklyReportStartDate(e.target.value)}
                            />
                        </div>
                        <div className="flex flex-col">
                            <label htmlFor="weeklyEndDate" className="text-sm font-medium text-gray-700 mb-1">Report End Date</label>
                            <input
                                type="date"
                                id="weeklyEndDate"
                                className="p-2 border border-gray-300 rounded-md focus:ring-green-500 focus:border-green-500"
                                value={weeklyReportEndDate}
                                onChange={(e) => setWeeklyReportEndDate(e.target.value)}
                            />
                        </div>
                    </div>
                    <button
                        onClick={generateWeeklyReport}
                        disabled={isGeneratingReport}
                        className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-4 rounded-lg shadow-md transition duration-200 ease-in-out transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
                    >
                        {isGeneratingReport ? (
                            <>
                                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                                Generating Weekly Report...
                            </>
                        ) : (
                                <>
                                    📊 Generate Weekly Report 📊
                                </>
                            )}
                    </button>

                    {generatedWeeklyReport && (
                        <div className="mt-4 bg-white p-4 rounded-md shadow-sm border border-gray-200">
                            <h3 className="text-lg font-semibold text-gray-800 mb-2">Generated Weekly Report:</h3>
                            <p className="text-gray-700 whitespace-pre-wrap">{generatedWeeklyReport}</p>
                            <div className="mt-4 pt-4 border-t border-gray-200 flex flex-col sm:flex-row items-center justify-center gap-3">
                                <input
                                    type="email"
                                    placeholder="Recipient Email (e.g., payroll@office.com)"
                                    className="flex-grow p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 text-sm"
                                    value={recipientEmail}
                                    onChange={(e) => setRecipientEmail(e.target.value)}
                                />
                                <button
                                    onClick={handleShareViaEmail}
                                    className="bg-blue-500 hover:bg-blue-600 text-white font-bold py-2 px-4 rounded-lg shadow-md transition duration-200 ease-in-out transform hover:scale-105 flex items-center justify-center text-sm w-full sm:w-auto"
                                >
                                    📧 Share via Email
                                </button>
                            </div>
                        </div>
                    )}

                    {reportError && (
                        <div className="mt-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
                            <strong className="font-bold">Error:</strong>
                            <span className="block sm:inline"> {reportError}</span>
                        </div>
                    )}

                    {/* CSV Download Button */}
                    <div className="mt-6 pt-4 border-t border-gray-200 flex justify-center">
                        <button
                            onClick={generateCsvReport}
                            className="bg-green-700 hover:bg-green-800 text-white font-bold py-2 px-4 rounded-lg shadow-md transition duration-200 ease-in-out transform hover:scale-105 flex items-center justify-center text-sm w-full sm:w-auto"
                        >
                            ⬇️ Download Weekly Summary as CSV
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default App;
