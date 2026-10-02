/**
 * @summary Live game-time tracking state for a game (staff only)
 */
export const GetTimekeepingResponse = zod.object({
  "clockRunning": zod.boolean(),
  "currentPeriodNumber": zod.number().nullish(),
  "periodsPlayed": zod.number(),
  "periods": zod.array(zod.object({
  "periodNumber": zod.number(),
  "startedAt": zod.string(),
  "endedAt": zod.string().nullish(),
  "plannedMinutes": zod.number().nullish()
})),
  "players": zod.array(zod.object({
  "person": zod.object({
  "id": zod.number(),
  "firstName": zod.string(),
  "lastName": zod.string(),
  "fullName": zod.string(),
  "email": zod.string().nullish(),
  "phone": zod.string().nullish(),
  "avatarUrl": zod.string().nullish(),
  "bio": zod.string().nullish(),
  "phonePrivacy": zod.enum(['everyone', 'admins', 'private']).optional(),
  "emailPrivacy": zod.enum(['everyone', 'admins', 'private']).optional(),
  "bioPrivacy": zod.enum(['everyone', 'admins', 'private']).optional(),
  "dateOfBirth": zod.string().nullish(),
  "isMinor": zod.boolean(),
  "hasLogin": zod.boolean().optional()
}),
  "jerseyNumber": zod.number().nullish(),
  "position": zod.string().nullish(),
  "onPitch": zod.boolean(),
  "secondsPlayed": zod.number(),
  "rsvpStatus": zod.enum(['going', 'maybe', 'out']).nullish()
}))
})


/**
 * @summary Start the next period (half) of the game clock (staff only)
 */
export const startPeriodBodyPlannedMinutesMax = 120;



export const StartPeriodBody = zod.object({
  "plannedMinutes": zod.number().min(1).max(startPeriodBodyPlannedMinutesMax).nullish()
})

export const StartPeriodResponse = zod.object({
  "clockRunning": zod.boolean(),
  "currentPeriodNumber": zod.number().nullish(),
  "periodsPlayed": zod.number(),
  "periods": zod.array(zod.object({
  "periodNumber": zod.number(),
  "startedAt": zod.string(),
  "endedAt": zod.string().nullish(),
  "plannedMinutes": zod.number().nullish()
})),
  "players": zod.array(zod.object({
  "person": zod.object({
  "id": zod.number(),
  "firstName": zod.string(),
  "lastName": zod.string(),
  "fullName": zod.string(),
  "email": zod.string().nullish(),
  "phone": zod.string().nullish(),
  "avatarUrl": zod.string().nullish(),
  "bio": zod.string().nullish(),
  "phonePrivacy": zod.enum(['everyone', 'admins', 'private']).optional(),
  "emailPrivacy": zod.enum(['everyone', 'admins', 'private']).optional(),
  "bioPrivacy": zod.enum(['everyone', 'admins', 'private']).optional(),
  "dateOfBirth": zod.string().nullish(),
  "isMinor": zod.boolean(),
  "hasLogin": zod.boolean().optional()
}),
  "jerseyNumber": zod.number().nullish(),
  "position": zod.string().nullish(),
  "onPitch": zod.boolean(),
  "secondsPlayed": zod.number(),
  "rsvpStatus": zod.enum(['going', 'maybe', 'out']).nullish()
}))
})


/**
 * @summary End the running period (half) of the game clock (staff only)
 */
export const EndPeriodResponse = zod.object({
  "clockRunning": zod.boolean(),
  "currentPeriodNumber": zod.number().nullish(),
  "periodsPlayed": zod.number(),
  "periods": zod.array(zod.object({
  "periodNumber": zod.number(),
  "startedAt": zod.string(),
  "endedAt": zod.string().nullish(),
  "plannedMinutes": zod.number().nullish()
})),
  "players": zod.array(zod.object({
  "person": zod.object({
  "id": zod.number(),
  "firstName": zod.string(),
  "lastName": zod.string(),
  "fullName": zod.string(),
  "email": zod.string().nullish(),
  "phone": zod.string().nullish(),
  "avatarUrl": zod.string().nullish(),
  "bio": zod.string().nullish(),
  "phonePrivacy": zod.enum(['everyone', 'admins', 'private']).optional(),
  "emailPrivacy": zod.enum(['everyone', 'admins', 'private']).optional(),
  "bioPrivacy": zod.enum(['everyone', 'admins', 'private']).optional(),
  "dateOfBirth": zod.string().nullish(),
  "isMinor": zod.boolean(),
  "hasLogin": zod.boolean().optional()
}),
  "jerseyNumber": zod.number().nullish(),
  "position": zod.string().nullish(),
  "onPitch": zod.boolean(),
  "secondsPlayed": zod.number(),
  "rsvpStatus": zod.enum(['going', 'maybe', 'out']).nullish()
}))
})


/**
 * @summary Toggle a player ON/OFF the pitch (staff only)
 */
export const TogglePlayerOnPitchResponse = zod.object({
  "clockRunning": zod.boolean(),
  "currentPeriodNumber": zod.number().nullish(),
  "periodsPlayed": zod.number(),
  "periods": zod.array(zod.object({
  "periodNumber": zod.number(),
  "startedAt": zod.string(),
  "endedAt": zod.string().nullish(),
  "plannedMinutes": zod.number().nullish()
})),
  "players": zod.array(zod.object({
  "person": zod.object({
  "id": zod.number(),
  "firstName": zod.string(),
  "lastName": zod.string(),
  "fullName": zod.string(),
  "email": zod.string().nullish(),
  "phone": zod.string().nullish(),
  "avatarUrl": zod.string().nullish(),
  "bio": zod.string().nullish(),
  "phonePrivacy": zod.enum(['everyone', 'admins', 'private']).optional(),
  "emailPrivacy": zod.enum(['everyone', 'admins', 'private']).optional(),
  "bioPrivacy": zod.enum(['everyone', 'admins', 'private']).optional(),
  "dateOfBirth": zod.string().nullish(),
  "isMinor": zod.boolean(),
  "hasLogin": zod.boolean().optional()
}),
  "jerseyNumber": zod.number().nullish(),
  "position": zod.string().nullish(),
  "onPitch": zod.boolean(),
  "secondsPlayed": zod.number(),
  "rsvpStatus": zod.enum(['going', 'maybe', 'out']).nullish()
}))
})


/**
 * @summary Season game-minutes totals per player (staff only)
 */
export const GetSeasonMinutesResponse = zod.object({
  "trackedGames": zod.number(),
  "players": zod.array(zod.object({
  "person": zod.object({
  "id": zod.number(),
  "firstName": zod.string(),
  "lastName": zod.string(),
  "fullName": zod.string(),
  "email": zod.string().nullish(),
  "phone": zod.string().nullish(),
  "avatarUrl": zod.string().nullish(),
  "bio": zod.string().nullish(),
  "phonePrivacy": zod.enum(['everyone', 'admins', 'private']).optional(),
  "emailPrivacy": zod.enum(['everyone', 'admins', 'private']).optional(),
  "bioPrivacy": zod.enum(['everyone', 'admins', 'private']).optional(),
  "dateOfBirth": zod.string().nullish(),
  "isMinor": zod.boolean(),
  "hasLogin": zod.boolean().optional()
}),
  "jerseyNumber": zod.number().nullish(),
  "position": zod.string().nullish(),
  "totalSeconds": zod.number(),
  "gamesPlayed": zod.number()
}))
})


/**
 * @summary List development cycles visible to the current user
 */
export const ListDevelopmentCyclesResponseItem = zod.object({
  "id": zod.number(),
  "teamId": zod.number(),
  "title": zod.string(),
  "reportingPeriod": zod.string(),
  "status": zod.enum(['active', 'submitted', 'released']),
  "createdBy": zod.object({
  "id": zod.number(),
  "firstName": zod.string(),
  "lastName": zod.string(),
  "fullName": zod.string()
}),
  "assessors": zod.array(zod.object({
  "id": zod.number(),
  "firstName": zod.string(),
  "lastName": zod.string(),
  "fullName": zod.string()
})),
  "internalRecipient": zod.union([zod.object({
  "id": zod.number(),
  "firstName": zod.string(),
  "lastName": zod.string(),
  "fullName": zod.string()
}),zod.null()]).optional(),
  "completedPlayers": zod.number(),
  "totalPlayers": zod.number(),
  "reviewedReports": zod.number(),
  "totalReports": zod.number(),
  "capabilities": zod.object({
  "canView": zod.boolean(),
  "canEdit": zod.boolean(),
  "canSubmit": zod.boolean(),
  "canReviewReports": zod.boolean(),
  "canRelease": zod.boolean()
}),
  "submittedAt": zod.string().nullish(),
  "releasedAt": zod.string().nullish(),
  "createdAt": zod.string()
})
export const ListDevelopmentCyclesResponse = zod.array(ListDevelopmentCyclesResponseItem)


/**
 * @summary Create a cycle and select its exact assessors
 */
export const createDevelopmentCycleBodyTitleMax = 120;

export const createDevelopmentCycleBodyReportingPeriodMax = 120;




export const CreateDevelopmentCycleBody = zod.object({
  "title": zod.string().min(1).max(createDevelopmentCycleBodyTitleMax),
  "reportingPeriod": zod.string().min(1).max(createDevelopmentCycleBodyReportingPeriodMax),
  "assessorIds": zod.array(zod.number()).min(1),
  "internalRecipientId": zod.number().nullish()
})

export const createDevelopmentCycleResponseTwoPlayersItemAssessmentOneOneOneTechnicalMax = 5;

export const createDevelopmentCycleResponseTwoPlayersItemAssessmentOneOneOneTacticalMax = 5;

export const createDevelopmentCycleResponseTwoPlayersItemAssessmentOneOneOnePhysicalMax = 5;

export const createDevelopmentCycleResponseTwoPlayersItemAssessmentOneOneOneCoachabilityMindsetMax = 5;

export const createDevelopmentCycleResponseTwoPlayersItemAssessmentOneOneOneEffortConsistencyMax = 5;

export const createDevelopmentCycleResponseTwoPlayersItemAssessmentOneOneOneTeamworkCommunicationMax = 5;

export const createDevelopmentCycleResponseTwoPlayersItemAssessmentOneOneOneAttendanceReliabilityMax = 5;

export const createDevelopmentCycleResponseTwoPlayersItemAssessmentOneOneTwoStrengthMax = 2000;

export const createDevelopmentCycleResponseTwoPlayersItemAssessmentOneOneTwoFocusMax = 2000;

export const createDevelopmentCycleResponseTwoPlayersItemAssessmentOneOneTwoInternalNotesMax = 5000;

export const createDevelopmentCycleResponseTwoPlayersItemReportDraftOneCategoriesItemScoreMax = 5;



export const CreateDevelopmentCycleResponse = zod.object({
  "id": zod.number(),
  "teamId": zod.number(),
  "title": zod.string(),
  "reportingPeriod": zod.string(),
  "status": zod.enum(['active', 'submitted', 'released']),
  "createdBy": zod.object({
  "id": zod.number(),
  "firstName": zod.string(),
  "lastName": zod.string(),
  "fullName": zod.string()
}),
  "assessors": zod.array(zod.object({
  "id": zod.number(),
  "firstName": zod.string(),
  "lastName": zod.string(),
  "fullName": zod.string()
})),
  "internalRecipient": zod.union([zod.object({
  "id": zod.number(),
  "firstName": zod.string(),
  "lastName": zod.string(),
  "fullName": zod.string()
}),zod.null()]).optional(),
  "completedPlayers": zod.number(),
  "totalPlayers": zod.number(),
  "reviewedReports": zod.number(),
  "totalReports": zod.number(),
  "capabilities": zod.object({
  "canView": zod.boolean(),
  "canEdit": zod.boolean(),
  "canSubmit": zod.boolean(),
  "canReviewReports": zod.boolean(),
  "canRelease": zod.boolean()
}),
  "submittedAt": zod.string().nullish(),
  "releasedAt": zod.string().nullish(),
  "createdAt": zod.string()
}).and(zod.object({
  "assessorChoices": zod.array(zod.object({
  "id": zod.number(),
  "firstName": zod.string(),
  "lastName": zod.string(),
  "fullName": zod.string()
})),
  "players": zod.array(zod.object({
  "person": zod.object({
  "id": zod.number(),
  "firstName": zod.string(),
  "lastName": zod.string(),
  "fullName": zod.string()
}),
  "complete": zod.boolean(),
  "assessment": zod.union([zod.object({
  "technical": zod.number().min(1).max(createDevelopmentCycleResponseTwoPlayersItemAssessmentOneOneOneTechnicalMax),
  "tactical": zod.number().min(1).max(createDevelopmentCycleResponseTwoPlayersItemAssessmentOneOneOneTacticalMax),
  "physical": zod.number().min(1).max(createDevelopmentCycleResponseTwoPlayersItemAssessmentOneOneOnePhysicalMax),
  "coachabilityMindset": zod.number().min(1).max(createDevelopmentCycleResponseTwoPlayersItemAssessmentOneOneOneCoachabilityMindsetMax),
  "effortConsistency": zod.number().min(1).max(createDevelopmentCycleResponseTwoPlayersItemAssessmentOneOneOneEffortConsistencyMax),
  "teamworkCommunication": zod.number().min(1).max(createDevelopmentCycleResponseTwoPlayersItemAssessmentOneOneOneTeamworkCommunicationMax),
  "attendanceReliability": zod.number().min(1).max(createDevelopmentCycleResponseTwoPlayersItemAssessmentOneOneOneAttendanceReliabilityMax)
}).and(zod.object({
  "strength": zod.string().min(1).max(createDevelopmentCycleResponseTwoPlayersItemAssessmentOneOneTwoStrengthMax),
  "focus": zod.string().min(1).max(createDevelopmentCycleResponseTwoPlayersItemAssessmentOneOneTwoFocusMax),
  "internalNotes": zod.string().max(createDevelopmentCycleResponseTwoPlayersItemAssessmentOneOneTwoInternalNotesMax).nullish()
})).and(zod.object({
  "id": zod.number(),
  "player": zod.object({
  "id": zod.number(),
  "firstName": zod.string(),
  "lastName": zod.string(),
  "fullName": zod.string()
}),
  "updatedBy": zod.object({
  "id": zod.number(),
  "firstName": zod.string(),
  "lastName": zod.string(),
  "fullName": zod.string()
}),
  "updatedAt": zod.string()
})),zod.null()]).optional(),
  "reportDraft": zod.union([zod.object({
  "player": zod.object({
  "id": zod.number(),
  "firstName": zod.string(),
  "lastName": zod.string(),
  "fullName": zod.string()
}),
  "categories": zod.array(zod.object({
  "key": zod.string(),
  "label": zod.string(),
  "score": zod.number().min(1).max(createDevelopmentCycleResponseTwoPlayersItemReportDraftOneCategoriesItemScoreMax),
  "narrative": zod.string()
})),
  "strength": zod.string(),
  "focus": zod.string(),
  "reviewedAt": zod.string().nullable()
}),zod.null()])
})),
  "rubric": zod.array(zod.object({
  "key": zod.string(),
  "label": zod.string(),
  "description": zod.string()
}))
}))


/**
 * @summary List eligible internal development report recipients
 */
export const ListDevelopmentRecipientCandidatesResponseItem = zod.object({
  "id": zod.number(),
  "firstName": zod.string(),
  "lastName": zod.string(),
  "fullName": zod.string()
})
export const ListDevelopmentRecipientCandidatesResponse = zod.array(ListDevelopmentRecipientCandidatesResponseItem)


/**
 * @summary Get a cycle, roster completion, rubric, and permitted internal detail
 */
export const getDevelopmentCycleResponseTwoPlayersItemAssessmentOneOneOneTechnicalMax = 5;

export const getDevelopmentCycleResponseTwoPlayersItemAssessmentOneOneOneTacticalMax = 5;

export const getDevelopmentCycleResponseTwoPlayersItemAssessmentOneOneOnePhysicalMax = 5;

export const getDevelopmentCycleResponseTwoPlayersItemAssessmentOneOneOneCoachabilityMindsetMax = 5;

export const getDevelopmentCycleResponseTwoPlayersItemAssessmentOneOneOneEffortConsistencyMax = 5;

export const getDevelopmentCycleResponseTwoPlayersItemAssessmentOneOneOneTeamworkCommunicationMax = 5;

export const getDevelopmentCycleResponseTwoPlayersItemAssessmentOneOneOneAttendanceReliabilityMax = 5;

export const getDevelopmentCycleResponseTwoPlayersItemAssessmentOneOneTwoStrengthMax = 2000;

export const getDevelopmentCycleResponseTwoPlayersItemAssessmentOneOneTwoFocusMax = 2000;

export const getDevelopmentCycleResponseTwoPlayersItemAssessmentOneOneTwoInternalNotesMax = 5000;

export const getDevelopmentCycleResponseTwoPlayersItemReportDraftOneCategoriesItemScoreMax = 5;



export const GetDevelopmentCycleResponse = zod.object({
  "id": zod.number(),
  "teamId": zod.number(),
  "title": zod.string(),
  "reportingPeriod": zod.string(),
  "status": zod.enum(['active', 'submitted', 'released']),
  "createdBy": zod.object({
  "id": zod.number(),
  "firstName": zod.string(),
  "lastName": zod.string(),
  "fullName": zod.string()
}),
  "assessors": zod.array(zod.object({
  "id": zod.number(),
  "firstName": zod.string(),
  "lastName": zod.string(),
  "fullName": zod.string()
})),
  "internalRecipient": zod.union([zod.object({
  "id": zod.number(),
  "firstName": zod.string(),
  "lastName": zod.string(),
  "fullName": zod.string()
}),zod.null()]).optional(),
  "completedPlayers": zod.number(),
  "totalPlayers": zod.number(),
  "reviewedReports": zod.number(),
  "totalReports": zod.number(),
  "capabilities": zod.object({
  "canView": zod.boolean(),
  "canEdit": zod.boolean(),
  "canSubmit": zod.boolean(),
  "canReviewReports": zod.boolean(),
  "canRelease": zod.boolean()
}),
  "submittedAt": zod.string().nullish(),
  "releasedAt": zod.string().nullish(),
  "createdAt": zod.string()
}).and(zod.object({
  "assessorChoices": zod.array(zod.object({
  "id": zod.number(),
  "firstName": zod.string(),
  "lastName": zod.string(),
  "fullName": zod.string()
})),
  "players": zod.array(zod.object({
  "person": zod.object({
  "id": zod.number(),
  "firstName": zod.string(),
  "lastName": zod.string(),
  "fullName": zod.string()
}),
  "complete": zod.boolean(),
  "assessment": zod.union([zod.object({
  "technical": zod.number().min(1).max(getDevelopmentCycleResponseTwoPlayersItemAssessmentOneOneOneTechnicalMax),
  "tactical": zod.number().min(1).max(getDevelopmentCycleResponseTwoPlayersItemAssessmentOneOneOneTacticalMax),
  "physical": zod.number().min(1).max(getDevelopmentCycleResponseTwoPlayersItemAssessmentOneOneOnePhysicalMax),
  "coachabilityMindset": zod.number().min(1).max(getDevelopmentCycleResponseTwoPlayersItemAssessmentOneOneOneCoachabilityMindsetMax),
  "effortConsistency": zod.number().min(1).max(getDevelopmentCycleResponseTwoPlayersItemAssessmentOneOneOneEffortConsistencyMax),
  "teamworkCommunication": zod.number().min(1).max(getDevelopmentCycleResponseTwoPlayersItemAssessmentOneOneOneTeamworkCommunicationMax),
  "attendanceReliability": zod.number().min(1).max(getDevelopmentCycleResponseTwoPlayersItemAssessmentOneOneOneAttendanceReliabilityMax)
}).and(zod.object({
  "strength": zod.string().min(1).max(getDevelopmentCycleResponseTwoPlayersItemAssessmentOneOneTwoStrengthMax),
  "focus": zod.string().min(1).max(getDevelopmentCycleResponseTwoPlayersItemAssessmentOneOneTwoFocusMax),
  "internalNotes": zod.string().max(getDevelopmentCycleResponseTwoPlayersItemAssessmentOneOneTwoInternalNotesMax).nullish()
})).and(zod.object({
  "id": zod.number(),
  "player": zod.object({
  "id": zod.number(),
  "firstName": zod.string(),
  "lastName": zod.string(),
  "fullName": zod.string()
}),
  "updatedBy": zod.object({
  "id": zod.number(),
  "firstName": zod.string(),
  "lastName": zod.string(),
  "fullName": zod.string()
}),
  "updatedAt": zod.string()
})),zod.null()]).optional(),
  "reportDraft": zod.union([zod.object({
  "player": zod.object({
  "id": zod.number(),
  "firstName": zod.string(),
  "lastName": zod.string(),
  "fullName": zod.string()
}),
  "categories": zod.array(zod.object({
  "key": zod.string(),
  "label": zod.string(),
  "score": zod.number().min(1).max(getDevelopmentCycleResponseTwoPlayersItemReportDraftOneCategoriesItemScoreMax),
  "narrative": zod.string()
})),
  "strength": zod.string(),
  "focus": zod.string(),
  "reviewedAt": zod.string().nullable()
}),zod.null()])
})),
  "rubric": zod.array(zod.object({
  "key": zod.string(),
  "label": zod.string(),
  "description": zod.string()
}))
}))


/**
 * @summary Save the shared assessment for one current player
 */
export const saveDevelopmentAssessmentBodyOneTechnicalMax = 5;

export const saveDevelopmentAssessmentBodyOneTacticalMax = 5;

export const saveDevelopmentAssessmentBodyOnePhysicalMax = 5;

export const saveDevelopmentAssessmentBodyOneCoachabilityMindsetMax = 5;

export const saveDevelopmentAssessmentBodyOneEffortConsistencyMax = 5;

export const saveDevelopmentAssessmentBodyOneTeamworkCommunicationMax = 5;

export const saveDevelopmentAssessmentBodyOneAttendanceReliabilityMax = 5;

export const saveDevelopmentAssessmentBodyTwoStrengthMax = 2000;

export const saveDevelopmentAssessmentBodyTwoFocusMax = 2000;

export const saveDevelopmentAssessmentBodyTwoInternalNotesMax = 5000;



export const SaveDevelopmentAssessmentBody = zod.object({
  "technical": zod.number().min(1).max(saveDevelopmentAssessmentBodyOneTechnicalMax),
  "tactical": zod.number().min(1).max(saveDevelopmentAssessmentBodyOneTacticalMax),
  "physical": zod.number().min(1).max(saveDevelopmentAssessmentBodyOnePhysicalMax),
  "coachabilityMindset": zod.number().min(1).max(saveDevelopmentAssessmentBodyOneCoachabilityMindsetMax),
  "effortConsistency": zod.number().min(1).max(saveDevelopmentAssessmentBodyOneEffortConsistencyMax),
  "teamworkCommunication": zod.number().min(1).max(saveDevelopmentAssessmentBodyOneTeamworkCommunicationMax),
  "attendanceReliability": zod.number().min(1).max(saveDevelopmentAssessmentBodyOneAttendanceReliabilityMax)
}).and(zod.object({
  "strength": zod.string().min(1).max(saveDevelopmentAssessmentBodyTwoStrengthMax),
  "focus": zod.string().min(1).max(saveDevelopmentAssessmentBodyTwoFocusMax),
  "internalNotes": zod.string().max(saveDevelopmentAssessmentBodyTwoInternalNotesMax).nullish()
}))

export const saveDevelopmentAssessmentResponseOneOneTechnicalMax = 5;

export const saveDevelopmentAssessmentResponseOneOneTacticalMax = 5;

export const saveDevelopmentAssessmentResponseOneOnePhysicalMax = 5;

export const saveDevelopmentAssessmentResponseOneOneCoachabilityMindsetMax = 5;

export const saveDevelopmentAssessmentResponseOneOneEffortConsistencyMax = 5;

export const saveDevelopmentAssessmentResponseOneOneTeamworkCommunicationMax = 5;

export const saveDevelopmentAssessmentResponseOneOneAttendanceReliabilityMax = 5;

export const saveDevelopmentAssessmentResponseOneTwoStrengthMax = 2000;

export const saveDevelopmentAssessmentResponseOneTwoFocusMax = 2000;

export const saveDevelopmentAssessmentResponseOneTwoInternalNotesMax = 5000;



export const SaveDevelopmentAssessmentResponse = zod.object({
  "technical": zod.number().min(1).max(saveDevelopmentAssessmentResponseOneOneTechnicalMax),
  "tactical": zod.number().min(1).max(saveDevelopmentAssessmentResponseOneOneTacticalMax),
  "physical": zod.number().min(1).max(saveDevelopmentAssessmentResponseOneOnePhysicalMax),
  "coachabilityMindset": zod.number().min(1).max(saveDevelopmentAssessmentResponseOneOneCoachabilityMindsetMax),
  "effortConsistency": zod.number().min(1).max(saveDevelopmentAssessmentResponseOneOneEffortConsistencyMax),
  "teamworkCommunication": zod.number().min(1).max(saveDevelopmentAssessmentResponseOneOneTeamworkCommunicationMax),
  "attendanceReliability": zod.number().min(1).max(saveDevelopmentAssessmentResponseOneOneAttendanceReliabilityMax)
}).and(zod.object({
  "strength": zod.string().min(1).max(saveDevelopmentAssessmentResponseOneTwoStrengthMax),
  "focus": zod.string().min(1).max(saveDevelopmentAssessmentResponseOneTwoFocusMax),
  "internalNotes": zod.string().max(saveDevelopmentAssessmentResponseOneTwoInternalNotesMax).nullish()
})).and(zod.object({
  "id": zod.number(),
  "player": zod.object({
  "id": zod.number(),
  "firstName": zod.string(),
  "lastName": zod.string(),
  "fullName": zod.string()
}),
  "updatedBy": zod.object({
  "id": zod.number(),
  "firstName": zod.string(),
  "lastName": zod.string(),
  "fullName": zod.string()
}),
  "updatedAt": zod.string()
}))


/**
 * @summary Review the family-safe wording for one submitted assessment
 */
export const saveDevelopmentReportDraftBodyCategoriesItemNarrativeMax = 1000;

export const saveDevelopmentReportDraftBodyCategoriesMin = 7;
export const saveDevelopmentReportDraftBodyCategoriesMax = 7;

export const saveDevelopmentReportDraftBodyStrengthMax = 2000;

export const saveDevelopmentReportDraftBodyFocusMax = 2000;



export const SaveDevelopmentReportDraftBody = zod.object({
  "categories": zod.array(zod.object({
  "key": zod.string(),
  "narrative": zod.string().min(1).max(saveDevelopmentReportDraftBodyCategoriesItemNarrativeMax)
})).min(saveDevelopmentReportDraftBodyCategoriesMin).max(saveDevelopmentReportDraftBodyCategoriesMax),
  "strength": zod.string().min(1).max(saveDevelopmentReportDraftBodyStrengthMax),
  "focus": zod.string().min(1).max(saveDevelopmentReportDraftBodyFocusMax)
})

export const saveDevelopmentReportDraftResponseCategoriesItemScoreMax = 5;



export const SaveDevelopmentReportDraftResponse = zod.object({
  "player": zod.object({
  "id": zod.number(),
  "firstName": zod.string(),
  "lastName": zod.string(),
  "fullName": zod.string()
}),
  "categories": zod.array(zod.object({
  "key": zod.string(),
  "label": zod.string(),
  "score": zod.number().min(1).max(saveDevelopmentReportDraftResponseCategoriesItemScoreMax),
  "narrative": zod.string()
})),
  "strength": zod.string(),
  "focus": zod.string(),
  "reviewedAt": zod.string().nullable()
})


/**
 * @summary Submit and lock a complete cycle
 */
export const submitDevelopmentCycleResponseTwoPlayersItemAssessmentOneOneOneTechnicalMax = 5;

export const submitDevelopmentCycleResponseTwoPlayersItemAssessmentOneOneOneTacticalMax = 5;

export const submitDevelopmentCycleResponseTwoPlayersItemAssessmentOneOneOnePhysicalMax = 5;

export const submitDevelopmentCycleResponseTwoPlayersItemAssessmentOneOneOneCoachabilityMindsetMax = 5;

export const submitDevelopmentCycleResponseTwoPlayersItemAssessmentOneOneOneEffortConsistencyMax = 5;

export const submitDevelopmentCycleResponseTwoPlayersItemAssessmentOneOneOneTeamworkCommunicationMax = 5;

export const submitDevelopmentCycleResponseTwoPlayersItemAssessmentOneOneOneAttendanceReliabilityMax = 5;

export const submitDevelopmentCycleResponseTwoPlayersItemAssessmentOneOneTwoStrengthMax = 2000;

export const submitDevelopmentCycleResponseTwoPlayersItemAssessmentOneOneTwoFocusMax = 2000;

export const submitDevelopmentCycleResponseTwoPlayersItemAssessmentOneOneTwoInternalNotesMax = 5000;

export const submitDevelopmentCycleResponseTwoPlayersItemReportDraftOneCategoriesItemScoreMax = 5;



export const SubmitDevelopmentCycleResponse = zod.object({
  "id": zod.number(),
  "teamId": zod.number(),
  "title": zod.string(),
  "reportingPeriod": zod.string(),
  "status": zod.enum(['active', 'submitted', 'released']),
  "createdBy": zod.object({
  "id": zod.number(),
  "firstName": zod.string(),
  "lastName": zod.string(),
  "fullName": zod.string()
}),
  "assessors": zod.array(zod.object({
  "id": zod.number(),
  "firstName": zod.string(),
  "lastName": zod.string(),
  "fullName": zod.string()
})),
  "internalRecipient": zod.union([zod.object({
  "id": zod.number(),
  "firstName": zod.string(),
  "lastName": zod.string(),
  "fullName": zod.string()
}),zod.null()]).optional(),
  "completedPlayers": zod.number(),
  "totalPlayers": zod.number(),
  "reviewedReports": zod.number(),
  "totalReports": zod.number(),
  "capabilities": zod.object({
  "canView": zod.boolean(),
  "canEdit": zod.boolean(),
  "canSubmit": zod.boolean(),
  "canReviewReports": zod.boolean(),
  "canRelease": zod.boolean()
}),
  "submittedAt": zod.string().nullish(),
  "releasedAt": zod.string().nullish(),
  "createdAt": zod.string()
}).and(zod.object({
  "assessorChoices": zod.array(zod.object({
  "id": zod.number(),
  "firstName": zod.string(),
  "lastName": zod.string(),
  "fullName": zod.string()
})),
  "players": zod.array(zod.object({
  "person": zod.object({
  "id": zod.number(),
  "firstName": zod.string(),
  "lastName": zod.string(),
  "fullName": zod.string()
}),
  "complete": zod.boolean(),
  "assessment": zod.union([zod.object({
  "technical": zod.number().min(1).max(submitDevelopmentCycleResponseTwoPlayersItemAssessmentOneOneOneTechnicalMax),
  "tactical": zod.number().min(1).max(submitDevelopmentCycleResponseTwoPlayersItemAssessmentOneOneOneTacticalMax),
  "physical": zod.number().min(1).max(submitDevelopmentCycleResponseTwoPlayersItemAssessmentOneOneOnePhysicalMax),
  "coachabilityMindset": zod.number().min(1).max(submitDevelopmentCycleResponseTwoPlayersItemAssessmentOneOneOneCoachabilityMindsetMax),
  "effortConsistency": zod.number().min(1).max(submitDevelopmentCycleResponseTwoPlayersItemAssessmentOneOneOneEffortConsistencyMax),
  "teamworkCommunication": zod.number().min(1).max(submitDevelopmentCycleResponseTwoPlayersItemAssessmentOneOneOneTeamworkCommunicationMax),
  "attendanceReliability": zod.number().min(1).max(submitDevelopmentCycleResponseTwoPlayersItemAssessmentOneOneOneAttendanceReliabilityMax)
}).and(zod.object({
  "strength": zod.string().min(1).max(submitDevelopmentCycleResponseTwoPlayersItemAssessmentOneOneTwoStrengthMax),
  "focus": zod.string().min(1).max(submitDevelopmentCycleResponseTwoPlayersItemAssessmentOneOneTwoFocusMax),
  "internalNotes": zod.string().max(submitDevelopmentCycleResponseTwoPlayersItemAssessmentOneOneTwoInternalNotesMax).nullish()
})).and(zod.object({
  "id": zod.number(),
  "player": zod.object({
  "id": zod.number(),
  "firstName": zod.string(),
  "lastName": zod.string(),
  "fullName": zod.string()
}),
  "updatedBy": zod.object({
  "id": zod.number(),
  "firstName": zod.string(),
  "lastName": zod.string(),
  "fullName": zod.string()
}),
  "updatedAt": zod.string()
})),zod.null()]).optional(),
  "reportDraft": zod.union([zod.object({
  "player": zod.object({
  "id": zod.number(),
  "firstName": zod.string(),
  "lastName": zod.string(),
  "fullName": zod.string()
}),
  "categories": zod.array(zod.object({
  "key": zod.string(),
  "label": zod.string(),
  "score": zod.number().min(1).max(submitDevelopmentCycleResponseTwoPlayersItemReportDraftOneCategoriesItemScoreMax),
  "narrative": zod.string()
})),
  "strength": zod.string(),
  "focus": zod.string(),
  "reviewedAt": zod.string().nullable()
}),zod.null()])
})),
  "rubric": zod.array(zod.object({
  "key": zod.string(),
  "label": zod.string(),
  "description": zod.string()
}))
}))


/**
 * @summary Create immutable family reports and notify authorised recipients
 */
export const ReleaseDevelopmentReportsResponse = zod.object({
  "released": zod.boolean(),
  "reportCount": zod.number(),
  "emailFailures": zod.number()
})


/**
 * @summary Restricted submitted-cycle team summary and prior-cycle changes
 */
export const getDevelopmentInternalSummaryResponsePlayersItemCategoriesItemScoreMax = 5;



export const GetDevelopmentInternalSummaryResponse = zod.object({
  "cycleId": zod.number(),
  "teamId": zod.number(),
  "teamCategoryAverages": zod.record(zod.string(), zod.number()),
  "players": zod.array(zod.object({
  "player": zod.object({
  "id": zod.number(),
  "firstName": zod.string(),
  "lastName": zod.string(),
  "fullName": zod.string()
}),
  "categories": zod.array(zod.object({
  "key": zod.string(),
  "label": zod.string(),
  "score": zod.number().min(1).max(getDevelopmentInternalSummaryResponsePlayersItemCategoriesItemScoreMax),
  "narrative": zod.string()
})),
  "currentAverage": zod.number(),
  "previousAverage": zod.number().nullable(),
  "averageChange": zod.number().nullable(),
  "categoryChanges": zod.record(zod.string(), zod.number().nullable()),
  "strength": zod.string(),
  "focus": zod.string(),
  "internalNotes": zod.string().nullable()
}))
})


/**
 * @summary List released family reports for a player
 */
export const listPlayerDevelopmentReportsResponseCategoriesItemScoreMax = 5;



export const ListPlayerDevelopmentReportsResponseItem = zod.object({
  "id": zod.number(),
  "cycleId": zod.number(),
  "player": zod.object({
  "id": zod.number(),
  "firstName": zod.string(),
  "lastName": zod.string(),
  "fullName": zod.string()
}),
  "coachingTeam": zod.array(zod.object({
  "id": zod.number(),
  "firstName": zod.string(),
  "lastName": zod.string(),
  "fullName": zod.string()
})),
  "reportingPeriod": zod.string(),
  "categories": zod.array(zod.object({
  "key": zod.string(),
  "label": zod.string(),
  "score": zod.number().min(1).max(listPlayerDevelopmentReportsResponseCategoriesItemScoreMax),
  "narrative": zod.string()
})),
  "strength": zod.string(),
  "focus": zod.string(),
  "disclosure": zod.string(),
  "releasedAt": zod.string()
})
export const ListPlayerDevelopmentReportsResponse = zod.array(ListPlayerDevelopmentReportsResponseItem)


/**
 * @summary Get one released family-safe report
 */
export const getDevelopmentReportResponseCategoriesItemScoreMax = 5;



export const GetDevelopmentReportResponse = zod.object({
  "id": zod.number(),
  "cycleId": zod.number(),
  "player": zod.object({
  "id": zod.number(),
  "firstName": zod.string(),
  "lastName": zod.string(),
  "fullName": zod.string()
}),
  "coachingTeam": zod.array(zod.object({
  "id": zod.number(),
  "firstName": zod.string(),
  "lastName": zod.string(),
  "fullName": zod.string()
})),
  "reportingPeriod": zod.string(),
  "categories": zod.array(zod.object({
  "key": zod.string(),
  "label": zod.string(),
  "score": zod.number().min(1).max(getDevelopmentReportResponseCategoriesItemScoreMax),
  "narrative": zod.string()
})),
  "strength": zod.string(),
  "focus": zod.string(),
  "disclosure": zod.string(),
  "releasedAt": zod.string()
})


