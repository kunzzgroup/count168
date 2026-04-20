package com.EazyCount.dao;

import com.EazyCount.entity.UserCompanyRow;
import java.util.List;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface AuthUserMapper {

    List<UserCompanyRow> selectAdminCandidates(
            @Param("loginId") String loginId, @Param("companyId") String companyId);

    void updateLastLogin(@Param("userId") long userId);

    void updateRememberToken(@Param("userId") long userId, @Param("token") String token);

    String selectSecondaryPassword(@Param("userId") long userId);
}
