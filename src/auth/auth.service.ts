import { HttpException, HttpStatus, Inject, Injectable } from "@nestjs/common";
import { InjectModel } from "@nestjs/mongoose";
import { User } from "../schemas/User.schema";
import mongoose, { Model } from "mongoose";
import { SignupDto } from "./Dtos/signup.dto";
import { CACHE_MANAGER } from "@nestjs/cache-manager";
import { Cache } from 'cache-manager';
import { MailerService } from "@nestjs-modules/mailer";
import { VerifyDto } from "./Dtos/verify.dto";
import { BadRequestException } from "@nestjs/common";
import { CompleteRegDto } from "./Dtos/completeReg.dto";
import { JwtService } from "@nestjs/jwt";
import { LoginDto } from "./Dtos/login.dto";
import { comparePass, hashPass } from "../shared/utils/bcrypt.util";
import { AdminDto } from "./Dtos/admin.dto";
import { Admin } from "../schemas/Admin.schema";
@Injectable()
export class AuthService {
  constructor(
    @InjectModel(User.name) private userModel: Model <User>,
    @InjectModel(Admin.name) private adminModel: Model<Admin>,
    @Inject(CACHE_MANAGER) private cacheManager: Cache,
    private readonly mailer_service: MailerService,
    private readonly jwt_service: JwtService
    ) {}
  async checkEmail(userEmail: string): Promise<void>{
    const existingUser = await this.userModel.findOne({ email: userEmail });
    const existingAdmin = await this.adminModel.findOne({ email: userEmail });
    if (existingUser || existingAdmin) {
      throw new BadRequestException('Email already exists');
    }
  }
  async initiateRegistration(signupDto: SignupDto){
    await this.checkEmail(signupDto.email);
    const verificationCode : string = Math.random().toString().substring(2, 12);
    await this.storeVerificationData(verificationCode, signupDto);
    await this.sendVerificationEmail(verificationCode, signupDto);
    return verificationCode;
  }
  async storeVerificationData(verificationCode: string, signupDto: SignupDto){
    const hashPassword: string = await hashPass(signupDto.password);
    const verificationData = {
      verification: verificationCode,
      email: signupDto.email,
      password: hashPassword
    };
    await this.cacheManager.set(`verification-${signupDto.email}`, verificationData );
  }

  async sendVerificationEmail(verificationCode: string, signupDto: SignupDto){
    await this.mailer_service.sendMail({
      to: signupDto.email,
      subject: 'Reset your password',
      html: ` Hello,

      Thank you for registering with our application. To complete your registration, please use the following verification code:

      Verification Code: ${verificationCode}

      If you did not request this verification code, please ignore this email.

      Best regards,
      Your Application Team`
    })
    return null
  }
  async verify(verifyDto: VerifyDto){
    const storeVerification = await this.cacheManager.get(`verification-${verifyDto.email}`) as {
      verification: string;
      email: string;
      password: string
    };
    // console.log(storeVerification)
    if(storeVerification == undefined || storeVerification.email != verifyDto.email)
      throw new BadRequestException("wrong Email");

    if(storeVerification.verification != verifyDto.verification )
      throw new BadRequestException("wrong verify code");

    const createUser = await this.userModel.create({
      email: storeVerification.email,
      password: storeVerification.password
    })
    const user = await createUser.save();
    const token: string = await this.createToken(user._id);
    return token;
  }
  async removeRegistrationData(email: string): Promise<void> {
    await this.cacheManager.del(`registration-${email}`);
  }
  async completeRegistration(id: string ,completeReg: CompleteRegDto){
    const user = await this.userModel.findByIdAndUpdate(id, {
      firstName: completeReg.firstName,
      midName: completeReg.midName,
      lastName:completeReg.lastName,
      age: completeReg.age,
      gender: completeReg.gender,
      DOB: completeReg.DOB,
      nationality: completeReg.nationality,
      governorate: completeReg.governorate,
      city: completeReg.city,
      region: completeReg.region,
      address: completeReg.address,
      phone: completeReg.phone,
      club: completeReg.club,
      qualification: completeReg.qualification,
      school: completeReg.school,
      schoolType: completeReg.schoolType,
      college: completeReg.college,
      university: completeReg.university,
      specialization: completeReg.specialization,
      languages: completeReg.languages,
      religion: completeReg.religion,
      height: completeReg.height,
      weight: completeReg.weight,
      skinColor: completeReg.skinColor,
      permanentDiseases: completeReg.permanentDiseases === "true" ,
      permanentDiseasesDetails: completeReg.permanentDiseasesDetails,
      disability:  completeReg.disability === "true",
      disabilityDetails: completeReg.disabilityDetails,
      faceImage: completeReg.faceImage,
      fullImage: completeReg.fullImage,
      idImage: completeReg.idImage,
      manWithIdImage:completeReg.manWithIdImage,
      car: completeReg.car === "true",
      carModel: completeReg.car,
      carType: completeReg.carType,
      apartment: completeReg.apartment === "true",
      space: completeReg.space,
      site: completeReg.site,
      businessOwner: completeReg.businessOwner === "true",
      businessType: completeReg.businessType,
      job: completeReg.job === "true",
      jobTitle: completeReg.jobTitle,
      jobCompany: completeReg.jobCompany,
      marriedBefore: completeReg.marriedBefore === "true",
      marriedNow: completeReg.marriedNow === "true",
      children: completeReg.children === "true",
      numberOfChildren: completeReg.numberOfChildren,
      agesOfChildren: completeReg.agesOfChildren,
      nameOfTheApplicantGuardian: completeReg.nameOfTheApplicantGuardian,
      relationWithApplicant: completeReg.relationWithApplicant,
      phoneOfGuardian: completeReg.phoneOfGuardian,
      hobbies: completeReg.hobbies,
      habits: completeReg.habbits,
      otherInfo: completeReg.otherInfo,
      livingAbroad:completeReg.livingAbroad === "true",
      isCompleted: true,
    }, { new: true } )
    return user
  }
  async login(loginDto: LoginDto): Promise<string> {
    let token: string;
    const user = await this.userModel.findOne({ email: loginDto.email });
    const admin = await this.adminModel.findOne({ email: loginDto.email });
    if (user != null) {
      try {
        await comparePass(loginDto.password, user.password);  // Option 1 (await)
      } catch (error) {
        throw new HttpException('Invalid password', HttpStatus.BAD_REQUEST); // Example error handling
      }
      token = await this.createToken(user._id);
    }else if(admin != null){
      try {
        await comparePass(loginDto.password, admin.password);  // Option 1 (await)
      } catch (error) {
        throw new HttpException('Invalid password', HttpStatus.BAD_REQUEST); // Example error handling
      }
       token = await this.createToken(admin._id);
    }else{
      throw new BadRequestException("wrong email")
    }
    return token;
  }
  async createAdmin(adminDto: AdminDto): Promise<string>{
    await this.checkEmail(adminDto.email);
    adminDto.password = await hashPass(adminDto.password);
    const createAdmin = await this.adminModel.create(adminDto);
    await createAdmin.save();
    return "admin created successfully";
  }
  async createToken(userId: mongoose.Types.ObjectId): Promise<string> {
    const payload:{id: mongoose.Types.ObjectId} = { id: userId };
    const token: string = await this.jwt_service.signAsync(payload);
    return token;
  }
}