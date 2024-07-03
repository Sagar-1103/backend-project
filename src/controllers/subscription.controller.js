import {asyncHandler} from "../utils/asyncHandler.js"
import {Subscription} from "../models/subscription.model.js"
import { ApiResponse } from "../utils/ApiResponse.js";
import { ApiError } from "../utils/ApiError.js";

const toggleSubscription = asyncHandler(async(req,res)=>{
    const {channelId} = req.params;
    const isSubscribed = await Subscription.findOne({channel:channelId})
    if (isSubscribed) {
        await Subscription.findByIdAndDelete(isSubscribed._id);
        res.status(200).json(new ApiResponse(200,{},"Channel Unsubscribed"))
    }
    else {
        const subscribe = await Subscription.create({
            subscriber:req.user?._id,
            channel:channelId
        })

        if (!subscribe) {
            throw new ApiError(500,"Something went wrong while subscribing");
        }
        res.status(200).json(new ApiResponse(200,subscribe,"Channel Subscribed"))
    }
})
const getUserChannelSubscribers = asyncHandler(async(req,res)=>{

})
const getSubscribedChannels = asyncHandler(async(req,res)=>{

})

export {toggleSubscription,getUserChannelSubscribers,getSubscribedChannels}