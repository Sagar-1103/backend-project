import { asyncHandler } from "../utils/asyncHandler.js";
import { Subscription } from "../models/subscription.model.js";
import { ApiResponse } from "../utils/ApiResponse.js";
import { ApiError } from "../utils/ApiError.js";
import mongoose from "mongoose";

const toggleSubscription = asyncHandler(async (req, res) => {
  const { channelId } = req.params;
  const isSubscribed = await Subscription.findOne({ channel: channelId });
  if (isSubscribed) {
    await Subscription.findByIdAndDelete(isSubscribed._id);
    res.status(200).json(new ApiResponse(200, {}, "Channel Unsubscribed"));
  } else {
    const subscribe = await Subscription.create({
      subscriber: req.user?._id,
      channel: channelId,
    });

    if (!subscribe) {
      throw new ApiError(500, "Something went wrong while subscribing");
    }
    res.status(200).json(new ApiResponse(200, subscribe, "Channel Subscribed"));
  }
});
const getUserChannelSubscribers = asyncHandler(async (req, res) => {
  const { subscriberId } = req.params;
  const subscribers = await Subscription.aggregate([
    {
      $match: {
        channel: new mongoose.Types.ObjectId(subscriberId),
      },
    },
    {
      $lookup: {
        from: "users",
        localField: "subscriber",
        foreignField: "_id",
        as: "subscribers",
        pipeline: [
          {
            $project: {
              username: 1,
              fullName: 1,
              avatar: 1,
              coverImage: 1,
            },
          },
        ],
      },
    },
    {
      $unwind: "$subscribers",
    },
    {
      $replaceRoot: { newRoot: "$subscribers" },
    },
  ]);

  res
    .status(200)
    .json(
      new ApiResponse(200, subscribers, "All subscribers fetched successfully")
    );
});
const getSubscribedChannels = asyncHandler(async (req, res) => {
    const { channelId } = req.params;
  const subscribedTo = await Subscription.aggregate([
    {
      $match: {
        subscriber: new mongoose.Types.ObjectId(channelId),
      },
    },
    {
      $lookup: {
        from: "users",
        localField: "channel",
        foreignField: "_id",
        as: "channels",
        pipeline: [
          {
            $project: {
              username: 1,
              fullName: 1,
              avatar: 1,
              coverImage: 1,
            },
          },
        ],
      },
    },
    {
      $unwind: "$channels",
    },
    {
      $replaceRoot: { newRoot: "$channels" },
    },
  ]);

  res
    .status(200)
    .json(
      new ApiResponse(200, subscribedTo, "All subscribed channels fetched successfully")
    );
});

export { toggleSubscription, getUserChannelSubscribers, getSubscribedChannels };
