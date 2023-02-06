
/*global BotWatch _config AmazonCognitoIdentity AWSCognito*/

var BotWatch = window.BotWatch || {};

(function scopeWrapper($) {
    var signinUrl = 'login.html';

    var poolData = {
        UserPoolId: _config.cognito.userPoolId,
        ClientId: _config.cognito.userPoolClientId
    };

    var userPool;

    if (!(_config.cognito.userPoolId &&
          _config.cognito.userPoolClientId &&
          _config.cognito.region)) {
        $('#noCognitoMessage').show();
        return;
    }

    userPool = new AmazonCognitoIdentity.CognitoUserPool(poolData);

    if (typeof AWSCognito !== 'undefined') {
        AWSCognito.config.region = _config.cognito.region;
    }

    BotWatch.signOut = function signOut() {
        userPool.getCurrentUser().signOut();
    };

    BotWatch.authToken = new Promise(function fetchCurrentAuthToken(resolve, reject) {
        var cognitoUser = userPool.getCurrentUser();

        if (cognitoUser) {
            cognitoUser.getSession(function sessionCallback(err, session) {
                if (err) {
                    reject(err);
                } else if (!session.isValid()) {
                    resolve(null);
                } else {
                    resolve(session.getIdToken().getJwtToken());
                }
            });
        } else {
            resolve(null);
        }
    });


    /*
     * Cognito User Pool functions
     */

    function register(email, password, onSuccess, onFailure) {
        var dataEmail = {
            Name: 'email',
            Value: email
        };
        var attributeEmail = new AmazonCognitoIdentity.CognitoUserAttribute(dataEmail);

        userPool.signUp(email, password, [attributeEmail], null,
            function signUpCallback(err, result) {
                if (!err) {
                    onSuccess(result);
                } else {
                    onFailure(err);
                }
            }
        );
    }

    function forgotPassword(email, onSuccess, onFailure) {
        //if they didn't provide an email address...
        if (email.length == 0) {
            alert("Please provide email address for password recovery");
            return;
        }
        var cognitoUser = createCognitoUser(email);
        currentUser = cognitoUser;
        cognitoUser.forgotPassword({
            onSuccess: onSuccess,
            onFailure: onFailure
        }); 
    }

    function signin(email, password, onSuccess, onFailure, onNewPasswordRequired = function(userAttributes, requiredAttributes){}) {
        var authenticationDetails = new AmazonCognitoIdentity.AuthenticationDetails({
            Username: email,
            Password: password
        });

        var cognitoUser = createCognitoUser(email);
        currentUser = cognitoUser;
        cognitoUser.authenticateUser(authenticationDetails, {
            onSuccess: onSuccess,
            onFailure: onFailure,
            newPasswordRequired: onNewPasswordRequired
        });
    }

    function verify(email, code, onSuccess, onFailure) {
        createCognitoUser(email).confirmRegistration(code, true, function confirmCallback(err, result) {
            if (!err) {
                onSuccess(result);
            } else {
                onFailure(err);
            }
        });
    }

    function confirmPassword(email, password, code, onSuccess, onFailure) {
        createCognitoUser(email).confirmPassword(code, password, {
            onSuccess() {
                console.log('password confirmed');
                onSuccess();
            },
            onFailure(err) {
                console.log("Password not confirmed");
                onFailure(err);
            }});
    }

    function createCognitoUser(email) {
        return new AmazonCognitoIdentity.CognitoUser({
            Username: email,
            Pool: userPool
        });
    }

    var signInSpecialData = null;
    var currentUser;
    function signInToChangePassword(specialData) {
        //show the confirm password button
        $('#signin-confirm-password').show();
        //change the text in the submit button
        $('#signin-submit').val('Change Password');
        //clear out the password field
        $('#passwordInputSignin').val('');
        //save the user attributes
        signInSpecialData = specialData;
        signInSpecialData.isVerify = false;
    }

    function changePasswordToSignIn() {
        //clear the userAttributes
        signInSpecialData = null;
        //change the text in the submit button
        $('#signin-submit').val('Change Password');
        //show the confirm password button
        $('#signin-confirm-password').val('').hide();
    }

    function signInToVerifyCode() {
        var specialData = {
        };

        signInToChangePassword(specialData);
        specialData.isVerify = true;  //This is set to false above
        //show the verification code dialog
        $('#signin-verification-code').show();
    }

    /*
     *  Event Handlers
     */

    $(function onDocReady() {
        $('#signinForm').submit(handleSignin);
        $('#registrationForm').submit(handleRegister);
        $('#verifyForm').submit(handleVerify);
        $('#confirmForm').submit(handleConfirmPassword);
        $('#forgotPasswordLink').click(handleForgotPassword);
    });

    function postSignInNavigate(email) {
        $.ajax({
            type: "GET",
            url: _config.api.invokeUrl + "/users/"+email
        }).then(function(response) {
            console.log("Got response", response);
            //if there isn't an AccountId on this user...
            if (response.AccountId == undefined) {
                alert(`User ${email} logged in, but no account found.  Please contact Automation Watchdog Support.`);
            } else {
                Cookies.set("accountId", response.AccountId);
                window.location.href = 'watchlist.html';
            }

        }).catch(function(err) {
            console.log("Got error:", err);
            alert("Got an error trying to get the account for user " + 
                email + ": " + err.statusText);

        });
    }

    function handleForgotPassword(event) {
        var email = $('#emailInputSignin').val();
        forgotPassword(email,
            function () {
                alert("Check your email for the password reset key");
                signInToVerifyCode();
            },
            function(err) {
                console.log("Error with forgotPassword:", err);
                alert("Error forgetting password, check console");
            });
    
    }

    function handleSignin(event) {
        var email = $('#emailInputSignin').val();
        var password = $('#passwordInputSignin').val();
        event.preventDefault();
        //if I don't have special data (meaning that this is a regular
        //signin attempt as opposed to a password change on signin or verification)
        if (signInSpecialData == undefined) {
            signin(email, password,
                function signinSuccess() {
                    console.log('Successfully Logged In. Getting account for user:', email);
                    console.log("Invoke URL:", _config.api.invokeUrl);
                    postSignInNavigate(email);
                },
                function signinError(err) {
                    alert(err);
                },
                function onNewPasswordRequired(userAttributes, requiredAttributes) {
                    //let the user know what's happening
                    delete userAttributes.email_verified;
                    signInSpecialData = {
                        userAttributes: userAttributes
                    }
                    alert("You need to change your password.  Please create a new password and submit.");
                    signInToChangePassword(signInSpecialData);
                }
            );
        } else {
            //if the passwords match...
            var email = $('#emailInputSignin').val();
            var password = $('#passwordInputSignin').val();
            var passwordMatch = $('#passwordConfirmSignin').val();
            console.log("About to complete, specialData:", signInSpecialData);
            if (password === passwordMatch) {
                //if this is a verification request...
                if (signInSpecialData.isVerify) {
                    var code = $('#verificationCodeSignin').val();
                    confirmPassword(email, password, code,
                        function verifySuccess(result) {
                            console.log('call result: ' + result);
                            console.log('Successfully verified');
                            alert('Verification successful.  You can now login with your new password.');
                            location.reload();
                            //window.location.href = signinUrl;
                        },
                        function verifyError(err) {
                            alert(err);
                        }
                    );
                //otherwise, it's a password change on login
                } else {
                    currentUser.completeNewPasswordChallenge(password, signInSpecialData.userAttributes, {
                        onSuccess: function(result) {
                            console.log("New password completed");
                            postSignInNavigate(email);
                        },
                        onFailure: function(err) {
                            console.log(err);
                            alert("New password setting failed... see console for details.");
                            changePasswordToSignIn();
                        }
                    });
                }
            } else {
                alert("Passwords do not match");
            }
        }
    }

    function handleRegister(event) {
        var email = $('#emailInputRegister').val();
        var password = $('#passwordInputRegister').val();
        var password2 = $('#password2InputRegister').val();

        var onSuccess = function registerSuccess(result) {
            var cognitoUser = result.user;
            console.log('user name is ' + cognitoUser.getUsername());
            var confirmation = ('Registration successful. Please check your email inbox or spam folder for your verification code.');
            if (confirmation) {
                window.location.href = 'verify.html';
            }
        };
        var onFailure = function registerFailure(err) {
            alert(err);
        };
        event.preventDefault();

        if (password === password2) {
            register(email, password, onSuccess, onFailure);
        } else {
            alert('Passwords do not match');
        }
    }

    function handleVerify(event) {
        var email = $('#emailInputVerify').val();
        var code = $('#codeInputVerify').val();
        event.preventDefault();
        verify(email, code,
            function verifySuccess(result) {
                console.log('call result: ' + result);
                console.log('Successfully verified');
                alert('Verification successful. You will now be redirected to the login page.');
                window.location.href = signinUrl;
            },
            function verifyError(err) {
                alert(err);
            }
        );
    }

    function handleConfirmPassword(event) {
        var email = $('#emailInputConfirm').val();
        var password = $('#passwordInputConfirm').val();
        var code = $('#codeInputConfirm').val();
        event.preventDefault();
        confirmPassword(email, password, code,
            function verifySuccess(result) {
                console.log('call result: ' + result);
                console.log('Successfully verified');
                alert('Verification successful.  You can now login with your new password.');
                //window.location.href = signinUrl;
            },
            function verifyError(err) {
                alert(err);
            }
        );
    }
}(jQuery));
