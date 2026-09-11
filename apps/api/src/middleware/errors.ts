import {Request,Response,NextFunction} from 'express'; import {ZodError} from 'zod';
export function notFound(_req:Request,res:Response){res.status(404).json({error:{code:'NOT_FOUND',message:'Route not found'}})}
export function errors(err:any,_req:Request,res:Response,_next:NextFunction){if(err instanceof ZodError)return res.status(400).json({error:{code:'VALIDATION_ERROR',message:'Invalid request',details:err.issues}});console.error(err);res.status(500).json({error:{code:'INTERNAL_ERROR',message:'Internal server error'}})}
