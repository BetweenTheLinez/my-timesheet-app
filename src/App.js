import React, { useState, useEffect, useCallback } from 'react';

// Helper function to convert time string (HH:MM) to minutes from midnight
const timeToMinutes = (timeString) => {
    if (!timeString) return 0;
    const [hours, minutes] = timeString.split(':').map(Number);
    return hours * 60 + minutes;
};

// Helper function to calculate duration in minutes between two time strings
const calculateDurationInMinutes = (startTime, endTime) => {
    if (!startTime || !endTime) return 0;
    const startMins = timeToMinutes(startTime);
    const endMins = timeToMinutes(endTime);
    const duration = endMins - startMins;
    return Math.max(0, duration);
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

// Function to get today's date in YYYY-MM-DD format
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
    const day = d.getDay(); // Sunday - 0, Monday - 1, ..., Saturday - 6
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Adjust if Sunday
    d.setDate(diff);
    return d.toISOString().split('T')[0];
};

// Function to get Sunday of the current week (for initial weekly report end date)
const getSundayOfCurrentWeek = () => {
    const d = new Date();
    const day = d.getDay(); // Sunday - 0, Monday - 1, ..., Saturday - 6
    const diff = d.getDate() - day + 7; // Adjust if Sunday
    d.setDate(diff);
    return d.toISOString().split('T')[0];
};


const App = () => {
    // State to store all weekly data, keyed by date (YYYY-MM-DD)
    // Each day's data includes employeeName, truckNumber, jobs array, and calculated totals
    const [weeklyData, setWeeklyData] = useState({});
    
    // State for the currently selected date (for daily input)
    const [selectedDate, setSelectedDate] = useState(getTodayDate());

    // Header info (employeeName, truckNumber) now lives within weeklyData for each day
    // We'll manage them as part of the current day's data for editing
    const [employeeName, setEmployeeName] = useState('');
    const [truckNumber, setTruckNumber] = useState('');

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
    // Access the current day's data from weeklyData
    const currentDayData = weeklyData[selectedDate] || {
        employeeName: '',
        truckNumber: '',
        jobs: Array(3).fill(null).map(() => createInitialJob()),
        dayOfWeek: getDayOfWeek(selectedDate),
        totalHours: 0,
        netHours: 0,
    };
    const currentJobs = currentDayData.jobs;
    const currentDayOfWeek = currentDayData.dayOfWeek;
    const currentTotalHours = currentDayData.totalHours;
    const currentNetHours = currentDayData.netHours;


    // EFFECT: Initialize/Load data for selectedDate when it changes
    useEffect(() => {
        // When selectedDate changes, update the employeeName and truckNumber states
        // to reflect what's stored for that specific day, or keep them blank if new day.
        setEmployeeName(currentDayData.employeeName);
        setTruckNumber(currentDayData.truckNumber);
        
        // Ensure dayOfWeek is correctly set based on selectedDate
        // This is now derived directly from selectedDate, so no need for a separate state update here.

        // Clear reports when changing day
        setGeneratedDailyReport('');
        setGeneratedWeeklyReport('');
        setReportError('');
    }, [selectedDate, weeklyData]); // Depend on weeklyData to ensure updates are reflected

    // Calculate total time worked for a single job
    const calculateJobTotal = useCallback((job) => {
        const travelToJobMinutes = calculateDurationInMinutes(job.travelStartTime, job.workStartTime);
        const workDurationMinutes = calculateDurationInMinutes(job.workStartTime, job.workFinishTime);
        const travelFromJobMinutes = calculateDurationInMinutes(job.workFinishTime, job.travelHomeTime);
        return travelToJobMinutes + workDurationMinutes + travelFromJobMinutes;
    }, []);

    // EFFECT: Recalculate current day's totals and save to weeklyData
    // This effect now depends on currentJobs (derived from weeklyData) and header inputs
    useEffect(() => {
        let sumTotalMinutes = 0;
        currentJobs.forEach(job => {
            const jobTotal = calculateJobTotal(job);
            sumTotalMinutes += jobTotal;
        });

        let currentNetMinutes = sumTotalMinutes;

        // Deduct 1 hour travel if workday > 6 hours
        if (sumTotalMinutes / 60 > 6) {
            currentNetMinutes -= 60; // Subtract 60 minutes
        }

        // Deduct 30 minutes lunch if workday > 4 hours
        if (sumTotalMinutes / 60 > 4) {
            currentNetMinutes -= 30; // Subtract 30 minutes
        }

        const finalNetMinutes = Math.max(0, currentNetMinutes);

        // Save current day's data and calculated totals to weeklyData
        setWeeklyData(prevWeeklyData => ({
            ...prevWeeklyData,
            [selectedDate]: {
                ...prevWeeklyData[selectedDate], // Keep existing properties if any
                employeeName: employeeName, // Save current employee name
                truckNumber: truckNumber,   // Save current truck number
                jobs: currentJobs,          // Save current jobs array
                dayOfWeek: getDayOfWeek(selectedDate), // Always derive dayOfWeek for saving
                totalHours: sumTotalMinutes,
                netHours: finalNetMinutes
            }
        }));

    }, [currentJobs, calculateJobTotal, employeeName, truckNumber, selectedDate]);


    // Handle input changes for main header fields
    const handleHeaderInputChange = (field, value) => {
        // Update the top-level state for employeeName/truckNumber
        if (field === 'employeeName') setEmployeeName(value);
        if (field === 'truckNumber') setTruckNumber(value);

        // Also, immediately update this in weeklyData for the current day
        setWeeklyData(prevWeeklyData => ({
            ...prevWeeklyData,
            [selectedDate]: {
                ...prevWeeklyData[selectedDate],
                jobs: prevWeeklyData[selectedDate]?.jobs || Array(3).fill(null).map(() => createInitialJob()), // Ensure jobs array exists
                dayOfWeek: getDayOfWeek(selectedDate),
                [field]: value, // Update the specific field
            }
        }));
    };

    // Handle input changes for job rows
    const handleJobInputChange = (jobId, field, value) => {
        setWeeklyData(prevWeeklyData => {
            const dayData = prevWeeklyData[selectedDate] || {
                employeeName: employeeName, // Use current employeeName from state
                truckNumber: truckNumber,   // Use current truckNumber from state
                jobs: Array(3).fill(null).map(() => createInitialJob()),
                dayOfWeek: getDayOfWeek(selectedDate),
                totalHours: 0,
                netHours: 0,
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
                employeeName: employeeName,
                truckNumber: truckNumber,
                jobs: [],
                dayOfWeek: getDayOfWeek(selectedDate),
                totalHours: 0,
                netHours: 0,
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
                return prevWeeklyData; // No change if max reached
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

        let prompt = `Generate a concise daily timesheet summary based on the following information. Focus on the jobs completed, total hours, and net working hours. Make it sound like a brief report for a supervisor.

Employee Name: ${employeeName || 'N/A'}
Truck Number: ${truckNumber || 'N/A'}
Date: ${selectedDate || 'N/A'}
Day of Week: ${currentDayOfWeek || 'N/A'}

Job Details:
`;
        if (currentJobs.length === 0 || currentJobs.every(job => !job.jobNumber && !job.jobLocation && !job.travelStartTime && !job.workStartTime && !job.workFinishTime && !job.travelHomeTime)) {
            prompt += "No job entries for this day.\n";
        } else {
            currentJobs.forEach((job, index) => {
                if (job.jobNumber || job.jobLocation || job.travelStartTime || job.workStartTime || job.workFinishTime || job.travelHomeTime) {
                    prompt += `Job ${index + 1}:
  Job Number: ${job.jobNumber || 'N/A'}
  Job Location: ${job.jobLocation || 'N/A'}
  Travel Start: ${job.travelStartTime || 'N/A'}
  Work Start: ${job.workStartTime || 'N/A'}
  Work Finish: ${job.workFinishTime || 'N/A'}
  Travel Home: ${job.travelHomeTime || 'N/A'}
  Total Time for Job: ${formatDecimalHours(job.totalTimeWorkedMinutes)} Hrs\n`;
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
            const apiKey = "";
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const result = await response.json();

            if (result.candidates && result.candidates.length > 0 &&
                result.candidates[0].content && result.candidates[0].content.parts &&
                result.candidates[0].content.parts.length > 0) {
                const text = result.candidates[0].content.parts[0].text;
                setGeneratedDailyReport(text);
            } else {
                setReportError("Failed to generate daily report. No content received.");
                console.error("Gemini API response structure unexpected:", result);
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

        let prompt = `Generate a comprehensive weekly timesheet summary for payroll based on the following daily information, covering the period from ${weeklyReportStartDate} to ${weeklyReportEndDate}. Provide a clear overview of each day's work and a total for the entire week.

Employee Name: ${employeeName || 'N/A'}
Truck Number: ${truckNumber || 'N/A'}
`;

        let totalWeeklyHours = 0;
        let totalWeeklyNetHours = 0;
        const datesToReport = Object.keys(weeklyData).filter(dateStr => {
            return dateStr >= weeklyReportStartDate && dateStr <= weeklyReportEndDate;
        }).sort();

        if (datesToReport.length === 0) {
            prompt += `No timesheet data entered for the selected week (${weeklyReportStartDate} to ${weeklyReportEndDate}).\n`;
        } else {
            datesToReport.forEach(date => {
                const dayData = weeklyData[date];
                const dayOfWeekForReport = getDayOfWeek(date);

                prompt += `\n--- ${dayOfWeekForReport}, ${date} ---\n`;
                if (!dayData || dayData.jobs.length === 0 || dayData.jobs.every(job => !job.jobNumber && !job.jobLocation && !job.travelStartTime && !job.workStartTime && !job.workFinishTime && !job.travelHomeTime)) {
                    prompt += "No job entries for this day.\n";
                } else {
                    dayData.jobs.forEach((job, index) => {
                        if (job.jobNumber || job.jobLocation || job.travelStartTime || job.workStartTime || job.workFinishTime || job.travelHomeTime) {
                            prompt += `Job ${index + 1}: ${job.jobNumber || 'N/A'} at ${job.jobLocation || 'N/A'} - Total: ${formatDecimalHours(job.totalTimeWorkedMinutes)} Hrs\n`;
                        }
                    });
                }
                prompt += `Daily Total Hours: ${formatDecimalHours(dayData.totalHours)} Hrs\n`;
                prompt += `Daily Net Working Hours: ${formatDecimalHours(dayData.netHours)} Hrs\n`;

                totalWeeklyHours += (dayData.totalHours || 0);
                totalWeeklyNetHours += (dayData.netHours || 0);
            });
        }

        prompt += `
\n--- Overall Weekly Summary (${weeklyReportStartDate} to ${weeklyReportEndDate}) ---
Total Hours for the Week: ${formatDecimalHours(totalWeeklyHours)} Hrs
Total Net Working Hours for the Week: ${formatDecimalHours(totalWeeklyNetHours)} Hrs
`;

        try {
            let chatHistory = [];
            chatHistory.push({ role: "user", parts: [{ text: prompt }] });
            const payload = { contents: chatHistory };
            const apiKey = "";
            const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

            const response = await fetch(apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const result = await response.json();

            if (result.candidates && result.candidates.length > 0 &&
                result.candidates[0].content && result.candidates[0].content.parts &&
                result.candidates[0].content.parts.length > 0) {
                const text = result.candidates[0].content.parts[0].text;
                setGeneratedWeeklyReport(text);
            } else {
                setReportError("Failed to generate weekly report. No content received.");
                console.error("Gemini API response structure unexpected:", result);
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


    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-100 to-indigo-200 p-4 sm:p-6 font-inter text-gray-800">
            <div className="max-w-6xl mx-auto bg-white shadow-xl rounded-xl p-6 sm:p-8">
                <h1 className="text-3xl sm:text-4xl font-extrabold text-center text-blue-800 mb-6">
                    Timesheet for Pro Air Mechanical
                </h1>

                {/* Header Information */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                    <div className="flex flex-col">
                        <label htmlFor="employeeName" className="text-sm font-medium text-gray-700 mb-1">Employee Name</label>
                        <input
                            type="text"
                            id="employeeName"
                            className="p-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                            value={employeeName}
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
                            value={truckNumber}
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
                            value={currentDayOfWeek} // Use derived dayOfWeek
                            readOnly // Day of week is derived
                        />
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
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Travel Home</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Total Time Worked (Hrs)</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {currentJobs.map((job, index) => ( // Use currentJobs here
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
                                        {currentJobs.length > 1 && ( // Use currentJobs length
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
                        disabled={currentJobs.length >= 12} // Use currentJobs length
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
                </div>
            </div>
        </div>
    );
};

export default App;
